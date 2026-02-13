function app() {
	const generateBillButton = document.querySelector('#bill-button');
	const billLink = document.querySelector('#bill-link');
	const errorDiv = document.querySelector('#error');

	generateBillButton.addEventListener('click', async () => {
		generateBillButton.textContent = 'Generando...';
		generateBillButton.disabled = true;
		billLink.style.display = 'none';
		errorDiv.hidden = true;

		try {
			const response = await fetch('/bill', {
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
			if (!response.ok) {
				throw new Error(data.message || JSON.stringify(data));
			}

			billLink.href = data.file;
			billLink.style.display = 'inline';
			await downloadPDF(data.file, data.file_name);
		} catch (err) {
			errorDiv.textContent = err.message;
			errorDiv.hidden = false;
		} finally {
			generateBillButton.textContent = 'Generar Factura B';
			generateBillButton.disabled = false;
		}
	});

	async function downloadPDF(url, filename = 'factura.pdf') {
		const response = await fetch(url);
		const blob = await response.blob();
		const blobUrl = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = blobUrl;
		a.download = filename;
		a.click();

		URL.revokeObjectURL(blobUrl);
	}
}

document.addEventListener('DOMContentLoaded', app);
