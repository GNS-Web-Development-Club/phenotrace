"""HPO vocabulary: terms, the is_a graph (for propagation), and gene<->phenotype
links.

Prefers a real `hp.json` (obographs format) + `genes_to_phenotype.txt` placed in
the app's HPO dir; otherwise falls back to the bundled SAMPLE subset. Built once
at startup and held in memory (the vocabulary is small relative to a VCF).
"""
from __future__ import annotations

import json
import math
import os
from typing import Iterable, Iterator, Optional

from ..config import GENES_TO_PHENOTYPE, HPO_JSON, hpo_dir
from ..models import HpoTerm
from .sample_data import GENE_PHENOTYPE as SAMPLE_GP
from .sample_data import TERMS as SAMPLE_TERMS


def _obo_id(uri: str) -> str:
    # http://purl.obolibrary.org/obo/HP_0001250 -> HP:0001250
    tail = uri.rsplit("/", 1)[-1]
    return tail.replace("_", ":")


class HpoVocabulary:
    def __init__(
        self,
        terms: dict[str, HpoTerm],
        parents: dict[str, set[str]],
        gene_to_terms: dict[str, set[str]],
        is_sample: bool,
    ) -> None:
        self.terms = terms
        self.parents = parents
        self.children: dict[str, set[str]] = {}
        for child, ps in parents.items():
            for p in ps:
                self.children.setdefault(p, set()).add(child)
        self.gene_to_terms = gene_to_terms
        self.term_to_genes: dict[str, set[str]] = {}
        for gene, tids in gene_to_terms.items():
            for tid in tids:
                self.term_to_genes.setdefault(tid, set()).add(gene)
        self.is_sample = is_sample
        self._anc_cache: dict[str, frozenset[str]] = {}
        self._desc_cache: dict[str, frozenset[str]] = {}
        self._spec_cache: dict[str, float] = {}

    # ---- construction ------------------------------------------------------
    @classmethod
    def load(cls) -> "HpoVocabulary":
        jpath = hpo_dir() / HPO_JSON
        if jpath.exists():
            try:
                gpath = hpo_dir() / GENES_TO_PHENOTYPE
                return cls._from_hp_json(str(jpath), str(gpath) if gpath.exists() else None)
            except Exception:
                pass  # fall back to the bundled sample
        return cls._from_sample()

    @classmethod
    def _from_sample(cls) -> "HpoVocabulary":
        terms: dict[str, HpoTerm] = {}
        parents: dict[str, set[str]] = {}
        for t in SAMPLE_TERMS:
            terms[t["id"]] = HpoTerm(
                id=t["id"],
                label=t["label"],
                definition=t.get("definition"),
                synonyms=list(t.get("synonyms", [])),
            )
            parents[t["id"]] = set(t.get("parents", []))
        gene_to_terms = {g: set(ids) for g, ids in SAMPLE_GP.items()}
        return cls(terms, parents, gene_to_terms, is_sample=True)

    @classmethod
    def _from_hp_json(cls, json_path: str, genes_path: Optional[str]) -> "HpoVocabulary":
        with open(json_path, "r", encoding="utf-8") as fh:
            doc = json.load(fh)
        graph = doc["graphs"][0]
        terms: dict[str, HpoTerm] = {}
        for node in graph.get("nodes", []):
            nid = node.get("id", "")
            if "HP_" not in nid:
                continue
            tid = _obo_id(nid)
            meta = node.get("meta", {}) or {}
            syns = [s.get("val") for s in meta.get("synonyms", []) if s.get("val")]
            definition = (meta.get("definition") or {}).get("val")
            terms[tid] = HpoTerm(
                id=tid, label=node.get("lbl") or tid, definition=definition, synonyms=syns
            )
        parents: dict[str, set[str]] = {tid: set() for tid in terms}
        for edge in graph.get("edges", []):
            if edge.get("pred") != "is_a":
                continue
            sub, obj = _obo_id(edge["sub"]), _obo_id(edge["obj"])
            if sub in parents:
                parents[sub].add(obj)

        gene_to_terms: dict[str, set[str]] = {}
        if genes_path and os.path.exists(genes_path):
            gene_to_terms = cls._parse_genes_to_phenotype(genes_path)
        return cls(terms, parents, gene_to_terms, is_sample=False)

    @staticmethod
    def _parse_genes_to_phenotype(path: str) -> dict[str, set[str]]:
        """genes_to_phenotype.txt is TSV; columns include a gene symbol and an
        HPO id. Header names vary across releases, so detect columns by content."""
        out: dict[str, set[str]] = {}
        with open(path, "r", encoding="utf-8") as fh:
            header = fh.readline().rstrip("\n").split("\t")
            lower = [h.lower() for h in header]
            sym_i = next((i for i, h in enumerate(lower) if "symbol" in h or "gene_symbol" in h), 1)
            hpo_i = next((i for i, h in enumerate(lower) if "hpo" in h and "id" in h), None)
            for line in fh:
                cols = line.rstrip("\n").split("\t")
                if len(cols) <= max(sym_i, hpo_i or 0):
                    continue
                gene = cols[sym_i]
                hpo = cols[hpo_i] if hpo_i is not None else next((c for c in cols if c.startswith("HP:")), None)
                if gene and hpo and hpo.startswith("HP:"):
                    out.setdefault(gene, set()).add(hpo)
        return out

    # ---- access ------------------------------------------------------------
    def get(self, tid: str) -> Optional[HpoTerm]:
        return self.terms.get(tid)

    def __contains__(self, tid: str) -> bool:
        return tid in self.terms

    def __len__(self) -> int:
        return len(self.terms)

    def ancestors(self, tid: str) -> frozenset[str]:
        if tid in self._anc_cache:
            return self._anc_cache[tid]
        seen: set[str] = set()
        stack = list(self.parents.get(tid, ()))
        while stack:
            p = stack.pop()
            if p in seen:
                continue
            seen.add(p)
            stack.extend(self.parents.get(p, ()))
        fs = frozenset(seen)
        self._anc_cache[tid] = fs
        return fs

    def descendants(self, tid: str) -> frozenset[str]:
        if tid in self._desc_cache:
            return self._desc_cache[tid]
        seen: set[str] = set()
        stack = list(self.children.get(tid, ()))
        while stack:
            c = stack.pop()
            if c in seen:
                continue
            seen.add(c)
            stack.extend(self.children.get(c, ()))
        fs = frozenset(seen)
        self._desc_cache[tid] = fs
        return fs

    def terms_for_gene(self, gene: str) -> set[str]:
        return self.gene_to_terms.get(gene, set())

    def genes_for_term(self, tid: str) -> set[str]:
        return self.term_to_genes.get(tid, set())

    def propagated_genes_for_term(self, tid: str) -> set[str]:
        """Genes annotated to this term OR any of its descendants (true annotation
        propagation up the is_a graph: a gene linked to a child is linked to the
        parent)."""
        genes = set(self.genes_for_term(tid))
        for d in self.descendants(tid):
            genes |= self.genes_for_term(d)
        return genes

    def term_specificity(self, tid: str) -> float:
        """Information-content weight in [0.4, 1.0] for how *discriminating* a term
        is. A term linked (after propagation) to one gene is maximally specific
        (1.0); one linked to every gene carries almost no signal (floored at 0.4).
        Returns 1.0 (neutral) when no gene annotations are loaded, so behavior is
        unchanged for vocabularies without a gene→phenotype file.

        IC(t) = log(N / n_t), normalized by the maximum possible IC = log(N).
        """
        if tid in self._spec_cache:
            return self._spec_cache[tid]
        total = len(self.gene_to_terms)
        if total <= 1:
            return 1.0
        n = len(self.propagated_genes_for_term(tid))
        if n <= 0:
            w = 1.0
        else:
            ic = math.log(total / n)
            max_ic = math.log(total)
            frac = ic / max_ic if max_ic > 0 else 0.0
            w = 0.4 + 0.6 * max(0.0, min(1.0, frac))
        self._spec_cache[tid] = w
        return w

    def lexical_phrases(self) -> Iterator[tuple[str, str, str]]:
        """Yield (phrase, term_id, source) for label + synonyms."""
        for tid, term in self.terms.items():
            yield term.label, tid, "label"
            for syn in term.synonyms:
                yield syn, tid, "synonym"

    def search(self, query: str, limit: int = 20) -> list[HpoTerm]:
        q = query.strip().lower()
        if not q:
            return []
        scored: list[tuple[float, HpoTerm]] = []
        for term in self.terms.values():
            label = term.label.lower()
            score = 0.0
            if label == q:
                score = 4.0
            elif label.startswith(q):
                score = 3.0
            elif q in label:
                score = 2.0
            else:
                for syn in term.synonyms:
                    sl = syn.lower()
                    if sl == q or sl.startswith(q):
                        score = max(score, 1.5)
                    elif q in sl:
                        score = max(score, 1.0)
            if score > 0:
                # tie-break shorter labels first (more specific match)
                scored.append((score - len(label) * 0.001, term))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [t for _, t in scored[:limit]]


def first_present(ids: Iterable[str], vocab: HpoVocabulary) -> list[str]:
    return [i for i in ids if i in vocab]
