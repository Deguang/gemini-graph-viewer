const puppeteer = require('puppeteer');
const fs = require('fs');

// Historical edge cases that previously caused parsing errors in Mermaid 11.4+
const TEST_CASES = [
    {
        name: "Case 1: Subgraph titles with special characters/parentheses",
        code: `graph TD
    %% 1. 控制面：配置与翻译
    subgraph 控制面 (Control Plane - 配置态)
        Admin --> AdminUI
    end`
    },
    {
        name: "Case 2: Edge labels with special characters/parentheses",
        code: `graph TD
    AdminUI -->|4. 点击发布 (写入)| KV[(Cloudflare KV)]:::db`
    },
    {
        name: "Case 3: Bare node labels with internal double quotes",
        code: `graph TD
    F[更新状态为"已支付"]`
    },
    {
        name: "Case 4: Full complex graph with all edge cases combined",
        code: `graph TD
    classDef user fill:#f9f2f4,stroke:#d04368,stroke-width:2px;
    classDef cf fill:#ebf4ff,stroke:#2b6cb0,stroke-width:2px;
    classDef db fill:#fefcbf,stroke:#b7791f,stroke-width:2px;

    A[开始: 用户提交订单] --> B{系统校验库存}
    B -- 库存充足 --> C[生成订单]
    B -- 库存不足 --> D[提示库存不足]
    D --> Z[结束: 流程终止]

    C --> E{用户是否完成支付?}
    E -- 支付成功 --> F[更新状态为"已支付"]
    E -- 支付超时 --> G[系统自动取消订单]
    G --> Z

    F --> H[通知仓库打包商品]
    H --> I[物流揽收并生成运单号]
    I --> J[更新状态为"已发货"]
    J --> Z

    %% 1. 控制面：配置与翻译
    subgraph 控制面 (Control Plane - 配置态)
        Admin((Admin 管理员)):::user -->|1. 登录 Admin / 编写表单结构| AdminUI[Admin 控制台<br>纯静态页面]:::cf
        AdminUI -->|2. 点击一键多语言| WorkerAI[Cloudflare Workers AI<br>大模型翻译生成]:::cf
        WorkerAI -.->|3. 返回多语言映射 JSON| AdminUI
        AdminUI -->|4. 点击发布 (写入)| KV[(Cloudflare KV<br>全局配置存储)]:::db
        AdminUI -->|5. 同步元数据| D1Meta[(Cloudflare D1<br>表单基础信息表)]:::db
    end`
    }
];

// The sanitization logic from content.js
function cleanMermaidCode(text) {
    let cleaned = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '#quot;').replace(/&amp;/g, '&');
    cleaned = cleaned.replace(/"/g, '#quot;');
    
    let subGraphCounter = 0;
    cleaned = cleaned.replace(/(\bsubgraph\s+)([^\n\r\u2028\u2029\{]+)/g, (match, p1, p2) => {
        let title = p2.trim();
        if (title.includes('[')) {
            return match; 
        }
        if (/[\(\)\{\}\<\>:#]/.test(title)) {
            subGraphCounter++;
            return `${p1}subgraph_fix_${subGraphCounter} ["${title}"]`;
        }
        return match;
    });

    cleaned = cleaned.replace(/(\-+>|==+>|\.-+>|\-+|\.\-+)\s*\|([^\|]+)\|/g, '$1|"$2"|');

    return cleaned;
}

async function runTests() {
    console.log("Starting Mermaid Edge Cases Tests...");
    
    // Check for Chrome executable (Mac specific path for this env, update if CI)
    const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (!fs.existsSync(executablePath)) {
        console.error(`Chrome not found at ${executablePath}. Skipping puppeteer test execution.`);
        return;
    }

    const browser = await puppeteer.launch({ 
        executablePath,
        headless: "new" 
    });
    const page = await browser.newPage();
    await page.addScriptTag({ path: './lib/mermaid.min.js' });
    
    let allPassed = true;

    for (const testCase of TEST_CASES) {
        console.log(`\n▶ Testing: ${testCase.name}`);
        
        // 1. Sanitize the code using our logic
        const sanitizedCode = cleanMermaidCode(testCase.code);
        
        // 2. Evaluate in Mermaid
        const result = await page.evaluate(async (text) => {
            mermaid.initialize({ startOnLoad: false });
            try {
                await mermaid.parse(text);
                return { success: true };
            } catch(e) {
                return { success: false, error: e.message.split('\n')[0] };
            }
        }, sanitizedCode);
        
        if (result.success) {
            console.log(`  ✅ PASSED`);
        } else {
            console.log(`  ❌ FAILED: ${result.error}`);
            console.log(`  Sanitized Code output was:\n${sanitizedCode}`);
            allPassed = false;
        }
    }
    
    await browser.close();

    if (!allPassed) {
        console.error("\n💥 Some tests failed!");
        process.exit(1);
    } else {
        console.log("\n🎉 All edge case tests passed successfully!");
    }
}

runTests();
