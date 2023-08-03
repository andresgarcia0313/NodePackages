const axios = require('axios');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

let browser;

async function getWeeklyDownloads(packageName, retryCount = 0) {
  const page = await browser.newPage();

  try {
    await page.goto(`https://www.npmjs.com/package/${packageName}`, { waitUntil: 'domcontentloaded' });
    if (await page.$('title').then(el => el?.textContent === 'Just a moment...')) {// Verificar si la página está bloqueada por Cloudflare
      const delay = retryCount * 10; // Retraso incremental en milisegundos
      await new Promise((resolve) => setTimeout(resolve, 50 + delay)); // Esperar 5 segundos + retraso
      return getWeeklyDownloads(packageName, retryCount + 1); // Reintentar obtener los datos
    }
    const htmlContent = await page.content();
    const $ = cheerio.load(htmlContent);
    const weeklyDownloadsElement = $('h3:contains("Weekly Downloads")').next('div').find('p');
    const weeklyDownloadsText = weeklyDownloadsElement.text().trim();
    const weeklyDownloads = parseInt(weeklyDownloadsText.replace(/[.,]/g, '')); // Convertir a número eliminando comas y puntos
    return isNaN(weeklyDownloads) ? 0 : weeklyDownloads;
  } catch (error) {
    throw error;
  } finally {
    await page.close();
  }
}

async function searchNpmPackages(searchQuery, numResults) {
  const searchUrl = `https://api.npms.io/v2/search?q=${encodeURIComponent(searchQuery)}`;
  try {
    const response = await axios.get(searchUrl);
    const packages = response.data.results;
    const limitedPackages = packages.slice(0, numResults);
    const packageRequests = limitedPackages.map(async (pkg, index) => {
      const packageName = pkg.package.name;
      const packagePopularity = pkg.score.detail.popularity;
      const packageVersion = pkg.package.version;
      try {
        const packageDownloads = await getWeeklyDownloads(packageName);
        return {
          name: packageName,
          version: packageVersion,
          downloads: packageDownloads,
          popularity: packagePopularity
        };
      } catch (error) {
        console.error(`Error al obtener el paquete "${packageName}":`, error);
        return {
          name: packageName,
          version: packageVersion,
          downloads: 0,
        };
      }
    });

    // Usar Promise.all para obtener las páginas en paralelo
    const packagesWithDownloads = await Promise.all(packageRequests);
    packagesWithDownloads.sort((pkg1, pkg2) => pkg2.downloads - pkg1.downloads);
    alignColumns(packagesWithDownloads, ['No.', 'Nombre', 'Versión', 'Descargas', 'Popularidad']);
  } catch (error) {
    console.error('Error al obtener los paquetes:', error);
  }
}

function printDividerLine(columnWidths) {
  let line = '';
  for (const width of columnWidths) {
    line += '+' + '-'.repeat(width + 2);
  }
  console.log(line + '+');
}

function alignColumns(packagesWithDownloads, columnNames) {
  const consoleWidth = process.stdout.columns;
  const header = [...columnNames]; // Utilizar los nombres de columna proporcionados por el usuario
  const columnWidths = columnNames.map((name) => consoleWidth / columnNames.length - 3); // Restar 3 para el espaciado y los bordes

  printDividerLine(columnWidths);

  // Imprimir los nombres de columna
  let headerLine = '';
  for (let i = 0; i < header.length; i++) {
    const paddedValue = header[i].padEnd(columnWidths[i]);
    headerLine += '|' + ` ${paddedValue} `;
  }
  console.log(headerLine + '|');

  printDividerLine(columnWidths);

  // Imprimir los paquetes
  for (let i = 0; i < packagesWithDownloads.length; i++) {
    const pkg = packagesWithDownloads[i];
    const values = [i + 1, pkg.name, pkg.version, pkg.downloads, pkg.popularity]; // Agregar "popularidad" a los valores
    let rowLine = '';
    for (let j = 0; j < values.length; j++) {
      const paddedValue = String(values[j]).padEnd(columnWidths[j]);
      rowLine += '|' + ` ${paddedValue} `;
    }
    console.log(rowLine + '|');
  }

  printDividerLine(columnWidths);
}

async function main() {
  try {
    console.clear();
    browser = await puppeteer.launch({ headless: "new" });
    const searchTerm = 'orm';
    const numberOfResults = 50;
    await searchNpmPackages(searchTerm, numberOfResults);
  } catch (error) {
    console.error('Error en la función principal:', error);
  } finally {
    await browser.close();
  }
}

main();
