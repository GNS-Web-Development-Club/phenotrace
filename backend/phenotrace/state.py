"""Process-wide application state.

A local single-user desktop tool has exactly one loaded VCF and one set of
opened annotation DBs at a time, so a module-level singleton is the right model
(no per-request session juggling). Later phases attach the annotation store,
HPO vocabulary, and scoring config here.
"""
from __future__ import annotations

from typing import Optional

from .annotation.store import AnnotationStore
from .config import session_db_path
from .models import VcfSummary
from .vcf.store import VcfSession


class AppState:
    def __init__(self) -> None:
        self.session: Optional[VcfSession] = None
        self.summary: Optional[VcfSummary] = None
        self.annotations = AnnotationStore()
        self.hpo = None  # HpoVocabulary (lazy)
        self._matcher = None  # PhenotypeMatcher (lazy)

    def load_vcf(self, path: str) -> VcfSummary:
        sess = VcfSession(str(session_db_path()))
        self.summary = sess.load(path)
        self.session = sess
        return self.summary

    def require_session(self) -> VcfSession:
        if self.session is None or self.summary is None:
            raise RuntimeError("No VCF loaded")
        return self.session

    def get_hpo(self):
        if self.hpo is None:
            from .hpo.vocabulary import HpoVocabulary

            self.hpo = HpoVocabulary.load()
        return self.hpo

    def get_matcher(self):
        if self._matcher is None:
            from .hpo.matcher import PhenotypeMatcher

            self._matcher = PhenotypeMatcher(self.get_hpo())
        return self._matcher

    def ensure_sample_db(self) -> None:
        """Materialize the bundled SAMPLE annotation DB if none is present.

        This performs NO network I/O — it is the offline first-run default. A
        production deployment would instead fetch/build real databases.
        """
        if not self.annotations.available():
            from .annotation.sample_db import build_sample_db

            build_sample_db(self.annotations.path)


state = AppState()
