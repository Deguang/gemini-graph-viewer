const puppeteer = require('puppeteer');
async function run() {
    const text1 = `graph TD\nsubgraph my_sub [#quot;My Title#quot;]\nA\nend`;

    const browser = await puppeteer.launch({ 
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: "new" 
    });
    const page = await browser.newPage();
    await page.addScriptTag({ path: './lib/mermaid.min.js' });
    
    const result = await page.evaluate(async (text) => {
        mermaid.initialize({ startOnLoad: false });
        try {
            await mermaid.parse(text);
            return 'SUCCESS';
        } catch(e) {
            return 'ERROR: ' + e.message.split('\n')[0];
        }
    }, text1);
    console.log('Result:', result);
    await browser.close();
}
run();
