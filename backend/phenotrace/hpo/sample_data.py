"""Bundled SAMPLE HPO vocabulary + gene->phenotype links.

A small, coherent subset of the Human Phenotype Ontology — enough to run the full
pipeline offline and to discriminate the fixture genes by phenotype. It is NOT the
full ontology. The loader prefers a real `hp.json` + `genes_to_phenotype.txt`
dropped into the app's HPO dir; this is the fallback.

Each term: id, label, synonyms, parents (is_a). Lay phrasings live separately in
`layterms.py` so they also apply when a real `hp.json` (which lacks them) is used.
"""
from __future__ import annotations

# id, label, [synonyms], [parent ids]
TERMS: list[dict] = [
    # --- nervous system -----------------------------------------------------
    {"id": "HP:0000707", "label": "Abnormality of the nervous system", "synonyms": [], "parents": []},
    {"id": "HP:0012638", "label": "Abnormal nervous system physiology", "synonyms": [], "parents": ["HP:0000707"]},
    {"id": "HP:0001250", "label": "Seizure", "synonyms": ["seizures", "epileptic seizure", "convulsion", "convulsions", "epilepsy"], "parents": ["HP:0012638"]},
    {"id": "HP:0002133", "label": "Status epilepticus", "synonyms": [], "parents": ["HP:0001250"]},
    {"id": "HP:0007359", "label": "Focal-onset seizure", "synonyms": ["focal seizure", "partial seizure"], "parents": ["HP:0001250"]},
    {"id": "HP:0011097", "label": "Epileptic spasms", "synonyms": ["infantile spasms"], "parents": ["HP:0001250"]},
    {"id": "HP:0001263", "label": "Global developmental delay", "synonyms": ["developmental delay", "delayed development", "neurodevelopmental delay", "psychomotor delay"], "parents": ["HP:0012638"]},
    {"id": "HP:0001249", "label": "Intellectual disability", "synonyms": ["mental retardation", "cognitive impairment", "intellectual disability"], "parents": ["HP:0012638"]},
    {"id": "HP:0000750", "label": "Delayed speech and language development", "synonyms": ["speech delay", "language delay", "delayed speech"], "parents": ["HP:0001263"]},
    {"id": "HP:0002376", "label": "Developmental regression", "synonyms": ["regression", "loss of developmental milestones", "developmental regression"], "parents": ["HP:0012638"]},
    {"id": "HP:0007281", "label": "Loss of purposeful hand movements", "synonyms": ["loss of hand use", "hand wringing"], "parents": ["HP:0002376"]},
    {"id": "HP:0001252", "label": "Hypotonia", "synonyms": ["muscular hypotonia", "low muscle tone", "decreased muscle tone", "muscle hypotonia"], "parents": ["HP:0012638"]},
    {"id": "HP:0001257", "label": "Spasticity", "synonyms": ["spastic"], "parents": ["HP:0012638"]},
    {"id": "HP:0001251", "label": "Ataxia", "synonyms": ["unsteady gait", "incoordination", "loss of coordination"], "parents": ["HP:0012638"]},
    {"id": "HP:0000717", "label": "Autism", "synonyms": ["autistic behavior", "autism spectrum disorder", "asd"], "parents": ["HP:0012638"]},
    {"id": "HP:0000733", "label": "Stereotypy", "synonyms": ["stereotypies", "stereotyped movements", "repetitive movements"], "parents": ["HP:0012638"]},
    {"id": "HP:0000252", "label": "Microcephaly", "synonyms": ["small head", "decreased head circumference", "small head circumference"], "parents": ["HP:0000707"]},
    {"id": "HP:0001355", "label": "Megalencephaly", "synonyms": ["large brain", "enlarged brain"], "parents": ["HP:0000707"]},
    # --- growth / general ---------------------------------------------------
    {"id": "HP:0001507", "label": "Growth abnormality", "synonyms": [], "parents": []},
    {"id": "HP:0001508", "label": "Failure to thrive", "synonyms": ["failure to gain weight", "poor weight gain"], "parents": ["HP:0001507"]},
    {"id": "HP:0004322", "label": "Short stature", "synonyms": ["short height", "decreased height", "small stature"], "parents": ["HP:0001507"]},
    {"id": "HP:0011968", "label": "Feeding difficulties", "synonyms": ["poor feeding", "feeding problems", "difficulty feeding"], "parents": ["HP:0001507"]},
    {"id": "HP:0001738", "label": "Exocrine pancreatic insufficiency", "synonyms": ["pancreatic insufficiency"], "parents": ["HP:0001507"]},
    # --- craniofacial -------------------------------------------------------
    {"id": "HP:0000271", "label": "Abnormality of the face", "synonyms": ["facial dysmorphism", "dysmorphic features"], "parents": []},
    {"id": "HP:0000316", "label": "Hypertelorism", "synonyms": ["widely spaced eyes", "wide-set eyes"], "parents": ["HP:0000271"]},
    # --- cardiovascular -----------------------------------------------------
    {"id": "HP:0001626", "label": "Abnormality of the cardiovascular system", "synonyms": [], "parents": []},
    {"id": "HP:0001629", "label": "Ventricular septal defect", "synonyms": ["vsd"], "parents": ["HP:0001626"]},
    {"id": "HP:0001642", "label": "Pulmonic stenosis", "synonyms": ["pulmonary stenosis", "pulmonary valve stenosis"], "parents": ["HP:0001626"]},
    {"id": "HP:0003124", "label": "Hypercholesterolemia", "synonyms": ["high cholesterol", "elevated cholesterol", "raised cholesterol"], "parents": ["HP:0001626"]},
    {"id": "HP:0001677", "label": "Coronary artery atherosclerosis", "synonyms": ["coronary artery disease", "atherosclerosis"], "parents": ["HP:0001626"]},
    # --- respiratory --------------------------------------------------------
    {"id": "HP:0002086", "label": "Abnormality of the respiratory system", "synonyms": [], "parents": []},
    {"id": "HP:0006538", "label": "Recurrent bronchopulmonary infections", "synonyms": ["recurrent lung infections", "recurrent chest infections", "recurrent respiratory infections"], "parents": ["HP:0002086"]},
    {"id": "HP:0012236", "label": "Increased sweat chloride", "synonyms": ["elevated sweat chloride"], "parents": ["HP:0002086"]},
    # --- neoplasm -----------------------------------------------------------
    {"id": "HP:0002664", "label": "Neoplasm", "synonyms": ["tumor", "cancer", "malignancy"], "parents": []},
    {"id": "HP:0003002", "label": "Breast carcinoma", "synonyms": ["breast cancer"], "parents": ["HP:0002664"]},
    {"id": "HP:0100615", "label": "Ovarian neoplasm", "synonyms": ["ovarian cancer", "ovarian tumor"], "parents": ["HP:0002664"]},
    {"id": "HP:0010566", "label": "Hamartoma", "synonyms": [], "parents": ["HP:0002664"]},
    # --- skin ---------------------------------------------------------------
    {"id": "HP:0000951", "label": "Abnormality of the skin", "synonyms": [], "parents": []},
    {"id": "HP:0009719", "label": "Hypomelanotic macule", "synonyms": ["ash leaf spot", "hypopigmented macule", "white patches"], "parents": ["HP:0000951"]},
]

# gene symbol -> associated HPO term ids (the connective tissue for scoring).
GENE_PHENOTYPE: dict[str, list[str]] = {
    "SCN1A": ["HP:0001250", "HP:0002133", "HP:0001263", "HP:0001249", "HP:0001251", "HP:0002376"],
    "MECP2": ["HP:0002376", "HP:0007281", "HP:0001249", "HP:0001250", "HP:0001252", "HP:0000252", "HP:0000733"],
    "TSC2": ["HP:0001250", "HP:0009719", "HP:0001249", "HP:0000717", "HP:0010566"],
    "MTOR": ["HP:0001250", "HP:0001355", "HP:0001249"],
    "CFTR": ["HP:0006538", "HP:0001738", "HP:0012236", "HP:0001508"],
    "KRAS": ["HP:0000316", "HP:0004322", "HP:0001629", "HP:0001642", "HP:0001249"],
    "BRCA1": ["HP:0003002", "HP:0100615"],
    "LDLR": ["HP:0003124", "HP:0001677"],
}
