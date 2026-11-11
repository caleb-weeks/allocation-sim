"""Sample scenarios. Each module here exposes build() -> dict, producing one data/<id>.json.

Modules are discovered automatically (see pipeline.build_seed); a module's build() must not use the
network: it reads raw inputs committed under pipeline/data/ or pipeline/raw/.
"""
