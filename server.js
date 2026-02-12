import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import Afip from '@afipsdk/afip.js';
import 'dotenv/config';
import { BBillSchema } from './src/schemas/bBill.js';

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

fastify.post('/bill', { schema: BBillSchema }, async function handler(request, reply) {
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
	 * Obtenemos el número y fecha de la última Factura B
	 **/
	const tipo_de_factura = 6; // Factura B
	const last_voucher = await afip.ElectronicBilling.getLastVoucher(punto_de_venta, tipo_de_factura);
	const voucher_info = await afip.ElectronicBilling.getVoucherInfo(last_voucher, punto_de_venta, tipo_de_factura);
	
	const numero_de_factura = last_voucher + 1;
	const importe_total = importe_gravado + importe_iva + importe_exento_iva;
	const fecha = Math.max(voucher_info.CbteFch, (parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ''))));

	const data = {
		CantReg: 1, // Cantidad de facturas a registrar
		PtoVta: punto_de_venta,
		CbteTipo: tipo_de_factura,
		Concepto: concepto,
		DocTipo: tipo_de_documento,
		DocNro: numero_de_documento,
		CbteDesde: numero_de_factura,
		CbteHasta: numero_de_factura,
		CbteFch: fecha,
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
	const pdfResponse = await generatePDF(
		punto_de_venta,
		numero_de_factura,
		fecha,
		fecha_servicio_desde,
		fecha_servicio_hasta,
		fecha_vencimiento_pago,
		numero_de_documento,
		importe_total,
		condicion_iva_receptor,
		billResponse.CAE,
		billResponse.CAEFchVto,
	);

	return pdfResponse;
});

async function generatePDF(
	punto_de_venta,
	numero_de_factura,
	fecha,
	fecha_servicio_desde,
	fecha_servicio_hasta,
	fecha_vencimiento_pago,
	numero_de_documento,
	importe_total,
	condicion_iva_receptor,
	cae,
	cae_vencimiento,
) {
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

	fecha = fecha.toString();
	const parsedDate = `${fecha.slice(6, 8)}/${fecha.slice(4, 6)}/${fecha.slice(0, 4)}`;
	const [year, month, day] = cae_vencimiento.split('-');
	const caeParsedDate = `${day}/${month}/${year}`;
	// Agregamos los valores de la factura al template
	const replacedBilltemplate = billTemplate({
		punto_de_venta: String(punto_de_venta).padStart(4, '0'),
		numero_de_factura: String(numero_de_factura).padStart(9, '0'),
		fecha_emision: parsedDate,
		cuit_emisor: process.env.AFIP_CUIT,
		ingresos_brutos: process.env.AFIP_CUIT,
		fecha_inicio_actividades: parsedDate,
		fecha_servicio_desde: fecha_servicio_desde || parsedDate,
		fecha_servicio_hasta: fecha_servicio_hasta || parsedDate,
		fecha_vencimiento_pago: fecha_vencimiento_pago || parsedDate,
		numero_de_documento,
		razon_social_receptor: '',
		condicion_iva_receptor,
		domicilio_receptor: '',
		importe_neto: importe_total.toFixed(2).replace('.', ','),
		importe_tributos: '0,00',
		importe_total: importe_total.toFixed(2).replace('.', ','),
		cae,
		cae_vencimiento: caeParsedDate,
	});

	// Creamos el PDF
	const pdfResponse = await afip.ElectronicBilling.createPDF({
		html: replacedBilltemplate,
		file_name: name,
		options: options,
	});

	return pdfResponse;
}

try {
	await fastify.listen({ port: Number(process.env.PORT) || 3000 });
} catch (err) {
	fastify.log.error(err);
	process.exit(1);
}
