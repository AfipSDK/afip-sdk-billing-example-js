import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import Afip from '@afipsdk/afip.js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({ logger: true });
await fastify.register(fastifyStatic, {
	root: path.join(__dirname, 'public'),
});

let cert, key;
if (process.env.AFIP_CERT_PATH && process.env.AFIP_KEY_PATH) {
	cert = fs.readFileSync(process.env.AFIP_CERT_PATH, { encoding: 'utf8' });
	key = fs.readFileSync(process.env.AFIP_KEY_PATH, { encoding: 'utf8' });
}

const billTemplate = Handlebars.compile(fs.readFileSync('./src/templates/bill.html', 'utf8'));
const afip = new Afip({
	...(key && { key }),
	...(cert && { cert }),
	CUIT: Number(process.env.AFIP_CUIT),
	access_token: process.env.AFIP_ACCESS_TOKEN,
});

const billSchema = {
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

fastify.post('/bill', { schema: billSchema }, async function handler(request, reply) {
	const {
		numero_de_documento,
		tipo_de_documento,
		importe_gravado,
		importe_exento_iva,
		importe_iva,
		punto_de_venta,
		concepto,
		condicion_iva_receptor,
		fecha_servicio_desde = null,
		fecha_servicio_hasta = null,
		fecha_vencimiento_pago = null,
	} = request.body;

	/**
	 * Obtenemos el número de la última Factura B
	 **/
	const tipo_de_factura = 6; // Factura B
	const importe_total = importe_gravado + importe_iva + importe_exento_iva;
	const fecha = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
	const last_voucher = await afip.ElectronicBilling.getLastVoucher(punto_de_venta, tipo_de_factura);
	const numero_de_factura = last_voucher + 1;

	const data = {
		CantReg: 1, // Cantidad de facturas a registrar
		PtoVta: punto_de_venta,
		CbteTipo: tipo_de_factura,
		Concepto: concepto,
		DocTipo: tipo_de_documento,
		DocNro: numero_de_documento,
		CbteDesde: numero_de_factura,
		CbteHasta: numero_de_factura,
		CbteFch: parseInt(fecha.replace(/-/g, '')),
		FchServDesde: fecha_servicio_desde,
		FchServHasta: fecha_servicio_hasta,
		FchVtoPago: fecha_vencimiento_pago,
		ImpTotal: importe_total,
		ImpTotConc: 0, // Importe neto no gravado
		ImpNeto: importe_gravado,
		ImpOpEx: importe_exento_iva,
		ImpIVA: importe_iva,
		ImpTrib: 0, //Importe total de tributos
		MonId: 'PES', //Tipo de moneda usada en la factura ('PES' = pesos argentinos)
		MonCotiz: 1, // Cotización de la moneda usada (1 para pesos argentinos)
		CondicionIVAReceptorId: condicion_iva_receptor,
		Iva: [
			// Alícuotas asociadas a la factura
			{
				Id: 5, // Id del tipo de IVA (5 = 21%)
				BaseImp: importe_gravado,
				Importe: importe_iva,
			},
		],
	};

	/**
	 * Creamos la Factura
	 **/
	const billResponse = await afip.ElectronicBilling.createVoucher(data);

	/**
	 * Generamos el PDF
	 **/

	// Nombre para el archivo (sin .pdf)
	const name = 'PDF de prueba';

	// Opciones para el archivo
	const options = {
		width: 8, // Ancho de pagina en pulgadas. Usar 3.1 para ticket
		marginLeft: 0.4, // Margen izquierdo en pulgadas. Usar 0.1 para ticket
		marginRight: 0.4, // Margen derecho en pulgadas. Usar 0.1 para ticket
		marginTop: 0.4, // Margen superior en pulgadas. Usar 0.1 para ticket
		marginBottom: 0.4, // Margen inferior en pulgadas. Usar 0.1 para ticket
	};

	// Agregamos los valores de la factura al template
	const replacedBillTemplate = billTemplate({
		punto_de_venta: String(punto_de_venta).padStart(4, '0'),
		numero_de_factura: String(numero_de_factura).padStart(9, '0'),
		fecha_emision: fecha,
		cuit_emisor: process.env.AFIP_CUIT,
		ingresos_brutos: process.env.AFIP_CUIT,
		fecha_inicio_actividades: fecha,
		fecha_servicio_desde: fecha_servicio_desde || fecha,
		fecha_servicio_hasta: fecha_servicio_hasta || fecha,
		fecha_vencimiento_pago: fecha_vencimiento_pago || fecha,
		numero_de_documento,
		razon_social_receptor: '',
		condicion_iva_receptor,
		domicilio_receptor: '',
		importe_neto: importe_total.toFixed(2).replace('.', ','),
		importe_tributos: '0,00',
		importe_total: importe_total.toFixed(2).replace('.', ','),
		cae: billResponse.CAE,
		cae_vencimiento: billResponse.CAEFchVto,
	});

	// Creamos el PDF
	const pdfResponse = await afip.ElectronicBilling.createPDF({
		html: replacedBillTemplate,
		file_name: name,
		options: options,
	});

	return pdfResponse;
});

try {
	await fastify.listen({ port: Number(process.env.PORT) || 3000 });
} catch (err) {
	fastify.log.error(err);
	process.exit(1);
}
