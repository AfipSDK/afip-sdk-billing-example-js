import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import QRCode from 'qrcode';
import Afip from '@afipsdk/afip.js';
import 'dotenv/config';
import { BBillSchema } from './src/schemas/bBill.js';
import { getTodayAsNumber, formatDateNumber, formatDateNumberISO } from './src/utils/date.js';

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
	const fecha = Math.max(voucher_info.CbteFch, getTodayAsNumber());

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
	 * Creamos el QR
	 */
	const qrUrl = await generateQR({
		fecha,
		punto_de_venta,
		numero_de_factura,
		tipo_de_factura,
		importe_total,
		numero_de_documento,
		tipo_de_documento,
		cae: billResponse.CAE,
	});

	/**
	 * Generamos el PDF
	 **/
	const pdfResponse = await generatePDF({
		punto_de_venta,
		numero_de_factura,
		fecha,
		fecha_servicio_desde,
		fecha_servicio_hasta,
		fecha_vencimiento_pago,
		numero_de_documento,
		importe_total,
		condicion_iva_receptor,
		cae: billResponse.CAE,
		cae_vencimiento: billResponse.CAEFchVto,
		qr_url: qrUrl,
	});

	return pdfResponse;
});

async function generatePDF({
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
	qr_url,
}) {
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

	const parsedDate = formatDateNumber(fecha);
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
		qr_url,
	});

	// Creamos el PDF
	const pdfResponse = await afip.ElectronicBilling.createPDF({
		html: replacedBilltemplate,
		file_name: name,
		options: options,
	});
	pdfResponse.file_name = `${pdfResponse.file_name}.pdf` 

	return pdfResponse;
}

async function generateQR({
	fecha,
	punto_de_venta,
	numero_de_factura,
	tipo_de_factura,
	importe_total,
	numero_de_documento,
	tipo_de_documento,
	cae,
}) {
	// Datos para el QR (Respetar si es string o numero)
	const QRCodeData = {
		ver: 1, // Versión del formato de los datos (1 por defecto)
		fecha: formatDateNumberISO(fecha), // Fecha de emisión del comprobante
		cuit: Number(process.env.AFIP_CUIT), // Cuit del Emisor del comprobante
		ptoVta: punto_de_venta, // Punto de venta utilizado para emitir el comprobante
		tipoCmp: tipo_de_factura, // Tipo de comprobante
		nroCmp: numero_de_factura, // Tipo de comprobante
		importe: importe_total, // Importe Total del comprobante (en la moneda en la que fue emitido)
		moneda: 'ARS', // Moneda del comprobante
		ctz: 1, // Cotización en pesos argentinos de la moneda utilizada
		tipoDocRec: tipo_de_documento, // Código del Tipo de documento del receptor
		nroDocRec: numero_de_documento, // Número de documento del receptor
		tipoCodAut: 'E', // “A” para comprobante autorizado por CAEA, “E” para comprobante autorizado por CAE
		codAut: Number(cae), // CAE o CAEA, segun corresponda
	};

	// Preparamos el texto para el qr en base a https://www.afip.gob.ar/fe/qr/documentos/QRespecificaciones.pdf
	const QRCodeText = `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(QRCodeData))}`;
	return await QRCode.toDataURL(QRCodeText);
}

try {
	await fastify.listen({ port: Number(process.env.PORT) || 3000 });
} catch (err) {
	fastify.log.error(err);
	process.exit(1);
}
