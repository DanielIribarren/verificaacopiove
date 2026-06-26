# Verifica Acopio VE

Herramienta web open source para verificar, limpiar y publicar datos abiertos sobre centros de acopio en Venezuela.

La meta no es competir con mapas o directorios existentes. Verifica Acopio VE funciona como una capa de confianza: importa fuentes, detecta duplicados, vence informacion vieja, coordina verificaciones voluntarias y publica datos consumibles por otras iniciativas.

## Flujos principales

- Vista publica: muestra centros verificados por defecto, filtros por ciudad, insumo y estado, ultima verificacion y compartir por WhatsApp.
- Panel voluntario: cola de centros pendientes, vencidos, saturados, duplicados y cerrados; permite registrar verificaciones, reportes y nuevos centros sugeridos.
- Datos abiertos: endpoints estaticos iniciales en `/api/centros.json`, `/api/centros.csv` y `/api/cambios.json`.

## Estados de confianza

- `sugerido`
- `pendiente_verificacion`
- `verificado`
- `requiere_reverificacion`
- `saturado`
- `cerrado`
- `duplicado`
- `rechazado`
- `archivado`

## Reglas de moderacion

- Un centro sin contacto no entra al mapa principal.
- Un reporte positivo de entrega no verifica por si solo.
- Dos reportes negativos de "no reciben" cierran temporalmente el centro.
- Dos reportes de "falso" rechazan y ocultan el centro.
- Dos reportes de "saturado" marcan el centro como saturado.
- Un centro verificado vence automaticamente:
  - 12h sin verificacion: `requiere_reverificacion`
  - 24h sin verificacion: se oculta del mapa principal
  - 48h sin verificacion: `archivado`

## Desarrollo local

```bash
npm install
npm run dev
```

## Verificacion

```bash
npm test
npm run build
```

## Fuentes futuras

La primera version incluye datos semilla. Las siguientes integraciones previstas son:

- Google Sheets de centros de acopio.
- CSV/API de ayudaparavenezuela.com.
- Entradas manuales de voluntarios.
- Directorios aliados como AJE, VeneConnect o venezolanos organizados por estado.

## Privacidad

Los exports publicos deben evitar datos privados de voluntarios. Las verificaciones publican metodo, resultado, notas operativas y timestamp, pero no identificadores personales sensibles.

## Licencia

MIT.
