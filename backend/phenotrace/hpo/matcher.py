"""Lexical clinical-text -> HPO matcher (v1).

Tokenizes free text and matches spans against HPO labels, synonyms, and a curated
lay-term map. Case-insensitive with light singularization so "seizures" matches
"Seizure". Multi-word terms are matched greedily longest-first and consumed so
"low muscle tone" maps to Hypotonia as one span rather than three partials.

The v2 semantic matcher (ONNX embeddings) is intentionally out of scope here, as
PLAN.md specifies — this stays dependency-free and instant.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..models import HpoCandidate
from .layterms import LAYTERMS
from .vocabulary import HpoVocabulary

_WORD = re.compile(r"[A-Za-z][A-Za-z0-9'\-]*")
_BASE_CONF = {"label": 0.95, "synonym": 0.85, "layterm": 0.80}


def _norm_token(tok: str) -> str:
    t = tok.lower()
    if len(t) > 3 and t.endswith("s") and not t.endswith("ss"):
        t = t[:-1]  # crude singularization: seizures -> seizure
    return t


def _norm_phrase(text: str) -> str:
    return " ".join(_norm_token(t) for t in _WORD.findall(text))


@dataclass
class _Tok:
    text: str
    start: int
    end: int


class PhenotypeMatcher:
    def __init__(self, vocab: HpoVocabulary) -> None:
        self.vocab = vocab
        self.index: dict[str, list[tuple[str, str]]] = {}
        self.maxw = 1
        for phrase, tid, source in vocab.lexical_phrases():
            self._add(phrase, tid, source)
        for phrase, tid in LAYTERMS.items():
            if tid in vocab:
                self._add(phrase, tid, "layterm")

    def _add(self, phrase: str, tid: str, source: str) -> None:
        norm = _norm_phrase(phrase)
        if not norm:
            return
        entries = self.index.setdefault(norm, [])
        if (tid, source) not in entries:
            entries.append((tid, source))
        self.maxw = max(self.maxw, len(norm.split()))

    def match(self, text: str) -> list[HpoCandidate]:
        toks = [_Tok(m.group(), m.start(), m.end()) for m in _WORD.finditer(text)]
        norms = [_norm_token(t.text) for t in toks]
        best: dict[str, HpoCandidate] = {}

        i = 0
        n = len(toks)
        while i < n:
            matched = False
            upper = min(self.maxw, n - i)
            for span in range(upper, 0, -1):
                key = " ".join(norms[i : i + span])
                entries = self.index.get(key)
                if not entries:
                    continue
                start = toks[i].start
                end = toks[i + span - 1].end
                matched_text = text[start:end]
                for tid, source in entries:
                    conf = min(0.99, _BASE_CONF[source] + 0.02 * (span - 1))
                    existing = best.get(tid)
                    if existing is not None and existing.confidence >= conf:
                        continue
                    term = self.vocab.get(tid)
                    if term is None:
                        continue
                    best[tid] = HpoCandidate(
                        term=term,
                        confidence=round(conf, 3),
                        matched_text=matched_text,
                        span_start=start,
                        span_end=end,
                        source=source,
                    )
                i += span
                matched = True
                break
            if not matched:
                i += 1

        return sorted(best.values(), key=lambda c: c.confidence, reverse=True)
