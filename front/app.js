function app() {
	const generateBillButton = document.querySelector('#button');
	const billLink = document.querySelector('#bill-link');

	generateBillButton.addEventListener('click', async () => {
		generateBillButton.disabled = true;
		generateBillButton.textContent = 'Generando...';
		billLink.style.display = 'none';

		const response = await fetch('http://localhost:3000/bill', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				numero_de_documento: 0,
				tipo_de_documento: 99,
				importe_gravado: 100,
				importe_exento_iva: 0,
				importe_iva: 21,
				punto_de_venta: 1,
				concepto: 1,
				condicion_iva_receptor: 5,
			}),
		});

		const data = await response.json();
		billLink.href = data.file;
		billLink.style.display = 'inline';
		generateBillButton.textContent = 'Generar Factura B';
		generateBillButton.disabled = false;
	});
}

document.addEventListener('DOMContentLoaded', app);
