"""PhenoTrace — local-first phenotype-driven variant triage.

Backend package. Everything here runs on the user's machine; patient data
(VCF) never leaves it. The only permitted network activity is the explicit,
user-initiated database update action (see ``annotation``/``download``).
"""

__version__ = "0.1.0"
