function app() {
	const generateBillButton = document.querySelector('#bill-button');
	const billLink = document.querySelector('#bill-link');
	const errorDiv = document.querySelector('#error');
	const billForm = document.querySelector('#bill-form');

	generateBillButton.addEventListener('click', async () => {
		generateBillButton.textContent = 'Generando...';
		generateBillButton.disabled = true;
		billLink.style.display = 'none';
		errorDiv.style.display = 'none';

		try {
			const formData = Object.fromEntries(new FormData(billForm));
			const response = await fetch('/bill', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData),
			});

			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || JSON.stringify(data));
			}

			billLink.href = data.file;
			billLink.style.display = 'inline';
			billLink.click();
		} catch (err) {
			errorDiv.textContent = err.message;
			errorDiv.style.display = 'block';
			errorDiv.scrollIntoView({
				behavior: 'smooth',
				block: 'start',
			});
		} finally {
			generateBillButton.textContent = 'Generar Factura B';
			generateBillButton.disabled = false;
		}
	});
}

document.addEventListener('DOMContentLoaded', app);
