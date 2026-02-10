# AFIP SDK - Ejemplo de Facturación Electrónica

Ejemplo de facturación electrónica con [Afip SDK](https://afipsdk.com/) usando Node.js y Fastify.

Genera **Facturas B** a través de los web services de AFIP y devuelve un PDF de la factura generada.

## Qué hace

- Expone un endpoint `POST /bill` que recibe los datos de una factura.
- Crea un comprobante electrónico (Factura B) en AFIP usando el servicio de facturación electrónica.
- Genera un PDF de la factura a partir de un template HTML (Handlebars).
- Incluye un frontend mínimo con un botón para generar una factura de prueba y descargar el PDF.

## Requisitos previos

- **Node.js** (v18 o superior, ya que usa ESM y top-level `await`)
- **Certificado y clave privada** de AFIP (archivos `.crt` y `.key`)
- **CUIT** del contribuyente emisor
- **Access Token** de [Afip SDK](https://afipsdk.com/)

## Instalación

```bash
npm install
```

## Configuración

Crear un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
PORT=3000
AFIP_CERT_PATH=./afip-keys/cert.crt
AFIP_KEY_PATH=./afip-keys/key.key
AFIP_CUIT=20123456789
AFIP_ACCESS_TOKEN=tu_access_token
```

| Variable | Descripción |
|---|---|
| `PORT` | Puerto en el que corre el servidor |
| `AFIP_CERT_PATH` | Ruta al certificado de AFIP |
| `AFIP_KEY_PATH` | Ruta a la clave privada de AFIP |
| `AFIP_CUIT` | CUIT del contribuyente emisor |
| `AFIP_ACCESS_TOKEN` | Access token de Afip SDK |

## Uso

```bash
node server.js
```

El servidor queda escuchando en `http://localhost:3000` (o el puerto configurado).

### Endpoint

**POST** `/bill`

```json
{
  "numero_de_documento": 12345678,
  "tipo_de_documento": 99,
  "importe_gravado": 100,
  "importe_exento_iva": 0,
  "importe_iva": 21,
  "punto_de_venta": 1,
  "concepto": 1,
  "condicion_iva_receptor": 5
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `numero_de_documento` | number | Documento del receptor |
| `tipo_de_documento` | integer | Tipo de documento (80: CUIT, 86: CUIL, 96: DNI, 99: Consumidor Final) |
| `importe_gravado` | number | Importe neto gravado |
| `importe_exento_iva` | number | Importe exento de IVA |
| `importe_iva` | number | Importe de IVA (21%) |
| `punto_de_venta` | integer | Punto de venta |
| `concepto` | integer | Concepto (1: Productos, 2: Servicios, 3: Productos y Servicios) |
| `condicion_iva_receptor` | integer | Condición frente al IVA del receptor |
| `fecha_servicio_desde` | integer | (Opcional) Fecha inicio del servicio |
| `fecha_servicio_hasta` | integer | (Opcional) Fecha fin del servicio |
| `fecha_vencimiento_pago` | integer | (Opcional) Fecha de vencimiento del pago |

La respuesta incluye la URL del PDF generado.

### Frontend

Abrir `front/index.html` en el navegador para usar la interfaz con un botón que genera una factura de prueba.

## Tecnologías

- [Fastify](https://fastify.dev/) - Servidor HTTP
- [@afipsdk/afip.js](https://www.npmjs.com/package/@afipsdk/afip.js) - SDK de AFIP
- [Handlebars](https://handlebarsjs.com/) - Templates HTML para el PDF
- [dotenv](https://www.npmjs.com/package/dotenv) - Variables de entorno
