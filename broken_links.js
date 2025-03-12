import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';
import pLimit from 'p-limit';
import XLSX from 'xlsx';

async function checkBrokenLinks(urls, concurrency = 5) {
    const browser = await puppeteer.launch({ headless: true });
    const resultsFile = "results.xlsx";
    const checkedLinks = new Set();
    const domain = "www.ups.com";
    const fileExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf', '.xls', '.xlsx','.docx', '.webp', '.zip', '.exe'];

    function saveResultsToExcel(data) {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Results");
        XLSX.writeFile(wb, resultsFile);
        console.log(`💾 Results saved to ${resultsFile}`);
    }

    const limit = pLimit(concurrency);
    const results = [];

    async function visitPage(url) {
        const page = await browser.newPage();
        let brokenLinks = [];
        let upsLinks = [];

        try {
            console.log(`Checking: ${url}`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            const links = await page.evaluate(() => 
                Array.from(document.querySelectorAll('a[href], img[src]'))
                    .map(el => el.href || el.src)
            );

            const newLinks = links.filter(link =>
                (link.startsWith("https://delivery-p55671-e392469.adobeaemcloud.com") || (link.includes(domain) && fileExtensions.some(ext => link.endsWith(ext))))
            );

            const linkChecks = newLinks.map(async (link) => {
                if (link.startsWith('https://delivery-p55671-e392469.adobeaemcloud.com')) {
                    try {
                        if (!checkedLinks.has(link)){
                            checkedLinks.add(link);
                            const response = await fetch(link, { method: 'HEAD' });
                            if (response.status === 404) {
                                console.log(`❌ Broken link found: ${link}`);
                                brokenLinks.push(link);
                            }
                        }
                    } catch (err) {
                        console.error(`Error checking ${link}:`, err);
                    }
                } else if (link.includes(domain)) {
                    console.log(`✅ Valid link pointing to ${domain}: ${link}`);
                    upsLinks.push(link);
                }
            });

            await Promise.all(linkChecks);
        } catch (err) {
            console.error(`Error accessing ${url}:`, err);
        } finally {
            await page.close();
        }

        if (brokenLinks.length > 0 || upsLinks.length > 0) {
            results.push({ URL: url, BrokenLinks: brokenLinks.join(', '), UpsLinks: upsLinks.join(', ') });
            saveResultsToExcel(results);
        }
    }

    await Promise.all(urls.map(url => limit(() => visitPage(url))));
    await browser.close();

}

// Read URLs from a text file
const pagesFile = "pages.txt";
const pagesToCheck = fs.readFileSync(pagesFile, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && line.startsWith("http"));

if (pagesToCheck.length === 0) {
    console.error("No valid URLs found in pages.txt");
} else {
    (async () => {
        const startTime = new Date();
        console.log(`🕒 Start time: ${startTime.toLocaleTimeString()}`);
        await checkBrokenLinks(pagesToCheck, 5);  // Adjust concurrency as needed
        const endTime = new Date();
        console.log(`🕒 End time: ${endTime.toLocaleTimeString()}`);
        process.exit(0);
    })();
}
