from jagadamba.jagadamba.pricing import calculate_oil_gas_pricing
from jagadamba.jagadamba.type_settings import sync_type_settings


def validate(doc, _method=None):
	sync_type_settings(doc)
	calculate_oil_gas_pricing(doc)
