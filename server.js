import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import Afip from '@afipsdk/afip.js';
import 'dotenv/config';
import { getTodayAsNumber, formatDateNumber } from './src/utils/date.js';

checkEnvs();
const fastify = Fastify({ logger: true });
await fastify.register(fastifyStatic, {
	root: path.join(path.dirname(fileURLToPath(import.meta.url)), 'public'),
});

/**
 * Seteamos el Certificado y la Key si estan disponibles
 */
let cert, key;
if (process.env.AFIP_CERT_PATH && process.env.AFIP_KEY_PATH) {
	cert = fs.readFileSync(process.env.AFIP_CERT_PATH, { encoding: 'utf8' });
	key = fs.readFileSync(process.env.AFIP_KEY_PATH, { encoding: 'utf8' });
}


/**
 * Creamos la instancia de AfipSDK
 */
const afip = new Afip({
	...(key && { key }),
	...(cert && { cert }),
	CUIT: Number(process.env.AFIP_CUIT),
	access_token: process.env.AFIP_ACCESS_TOKEN,
});

fastify.post('/bill', {}, async function handler(request, reply) {
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
	} = getParsedData(request.body);

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
	 * Generamos el PDF usando templates
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
		importe_iva,
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
	importe_iva,
}) {
	const parsedDate = formatDateNumber(fecha);
	const [year, month, day] = cae_vencimiento.split('-');
	const caeParsedDate = `${day}/${month}/${year}`;

	const pdfResponse = await afip.ElectronicBilling.createPDF({
		file_name: `factura-b-${String(numero_de_factura).padStart(8, '0')}.pdf`,
		template: {
			name: 'invoice-b',
			params: {
				voucher_number: Number(numero_de_factura),
				sales_point: Number(punto_de_venta),
				issue_date: parsedDate,
				cae_due_date: caeParsedDate,
				issuer_cuit: Number(process.env.AFIP_CUIT),
				cae: String(cae),
				issuer_business_name: 'Empresa imaginaria S.A.',
				issuer_address: 'Calle falsa 123',
				issuer_iva_condition: 'Responsable inscripto',
				issuer_gross_income: String(process.env.AFIP_CUIT),
				issuer_activity_start_date: parsedDate,
				receiver_name: '',
				receiver_address: '-',
				receiver_document_type: 99,
				receiver_document_number: Number(numero_de_documento),
				receiver_iva_condition: String(condicion_iva_receptor),
				sale_condition: 'Contado',
				currency_id: 'ARS',
				currency_rate: 1,
				concept: 1,
				billing_from: fecha_servicio_desde ? formatDateNumber(fecha_servicio_desde) : undefined,
				billing_to: fecha_servicio_hasta ? formatDateNumber(fecha_servicio_hasta) : undefined,
				payment_due_date: fecha_vencimiento_pago ? formatDateNumber(fecha_vencimiento_pago) : undefined,
				items: [
					{
						code: '001',
						description: 'Servicio',
						quantity: 1,
						unit_price: Number(importe_total),
						subtotal: Number(importe_total),
					},
				],
				vat_amount: Number(importe_iva),
				tributes_amount: 0,
				total_amount: Number(importe_total),
			},
		},
	});

	return pdfResponse;
}

function checkEnvs() {
	if (
		!process.env.AFIP_CUIT ||
		!process.env.AFIP_ACCESS_TOKEN ||
		!!process.env.AFIP_CERT_PATH !== !!process.env.AFIP_KEY_PATH
	) {
		console.error('ERROR: Falta configurar variables de ambiente revise el README para mas información.');
		process.exit(1);
	}
}

function getParsedData(data) {
	const parsedData = { ...data };
	for (key in parsedData) {
		parsedData[key] = Number(parsedData[key]);
	}
	return parsedData;
}

try {
	await fastify.listen({ port: 4719 });
} catch (err) {
	fastify.log.error(err);
	process.exit(1);
}
