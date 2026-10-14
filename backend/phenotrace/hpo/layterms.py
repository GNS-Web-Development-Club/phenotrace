"""Hand-curated lay-term -> HPO id map.

HPO synonyms cover a surprising amount of lay phrasing, but not all. This small
map catches common colloquialisms the synonyms miss. It is merged into the
matcher's phrase index and therefore applies even when a real `hp.json` is loaded
(which carries no lay terms). Keep entries unambiguous — a lay phrase that maps to
the wrong concept erodes trust faster than a missed match.
"""
from __future__ import annotations

LAYTERMS: dict[str, str] = {
    "fits": "HP:0001250",
    "fit": "HP:0001250",
    "floppy": "HP:0001252",
    "floppy baby": "HP:0001252",
    "slow development": "HP:0001263",
    "slow to develop": "HP:0001263",
    "learning disability": "HP:0001249",
    "learning difficulties": "HP:0001249",
    "clumsy": "HP:0001251",
    "clumsiness": "HP:0001251",
    "losing skills": "HP:0002376",
    "loss of skills": "HP:0002376",
    "small head": "HP:0000252",
    "high cholesterol": "HP:0003124",
    "salty sweat": "HP:0012236",
    "salty skin": "HP:0012236",
    "wide set eyes": "HP:0000316",
    "wide-set eyes": "HP:0000316",
    "not gaining weight": "HP:0001508",
    "breast cancer": "HP:0003002",
    "ovarian cancer": "HP:0100615",
    "recurrent chest infections": "HP:0006538",
    "recurrent lung infections": "HP:0006538",
    "hand wringing": "HP:0007281",
}
