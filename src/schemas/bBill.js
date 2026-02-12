export const BBillSchema = {
	body: {
		type: 'object',
		required: [
			'numero_de_documento',
			'tipo_de_documento',
			'importe_gravado',
			'importe_exento_iva',
			'importe_iva',
			'punto_de_venta',
			'concepto',
			'condicion_iva_receptor',
		],
		properties: {
			numero_de_documento: { type: 'number' },
			tipo_de_documento: { type: 'integer', enum: [80, 86, 96, 99] },
			importe_gravado: { type: 'number', exclusiveMinimum: 0 },
			importe_exento_iva: { type: 'number', minimum: 0 },
			importe_iva: { type: 'number', exclusiveMinimum: 0 },
			punto_de_venta: { type: 'integer' },
			concepto: { type: 'integer', enum: [1, 2, 3] },
			condicion_iva_receptor: { type: 'integer', enum: [1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16] },
			fecha_servicio_desde: { type: 'integer', default: null, nullable: true },
			fecha_servicio_hasta: { type: 'integer', default: null, nullable: true },
			fecha_vencimiento_pago: { type: 'integer', default: null, nullable: true },
		},
	},
};
