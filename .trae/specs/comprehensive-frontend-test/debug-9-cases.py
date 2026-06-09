# -*- coding: utf-8 -*-
# 详细分析 9 案件 mock 测试结果，找出 2 个 fail 的案件
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE_URL = "http://127.0.0.1:5199/"
MOCK_PATH = Path(__file__).parent / "full-electronapi-mock.js"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        # 注入 mock
        mock_code = MOCK_PATH.read_text(encoding="utf-8")
        await page.add_init_script(mock_code)

        # 注入错误捕获
        await page.add_init_script("""
            window.__errorLog = window.__errorLog || [];
        """)

        # 加载页面
        await page.goto(BASE_URL, wait_until="networkidle")
        await page.wait_for_timeout(2000)

        # 跑 9 案件 + 显示每个的详细结果
        result = await page.evaluate("""
            (async () => {
                const tests = {
                    test1_apiKey: await window.__mosaicTest.test1_apiKey(),
                    test2_chat: await window.__mosaicTest.test2_chat(),
                    test3_toolCall: await window.__mosaicTest.test3_toolCall(),
                    test4_modelSwitch: await window.__mosaicTest.test4_modelSwitch(),
                    test5_history: await window.__mosaicTest.test5_history(),
                    test6_error: await window.__mosaicTest.test6_error(),
                    test7_data: await window.__mosaicTest.test7_data(),
                    test8_pythonStatus: await window.__mosaicTest.test8_pythonStatus(),
                    test9_login: await window.__mosaicTest.test9_login('Andeo', 'Funkes')
                };
                return tests;
            })()
        """)
        print("=" * 60)
        print("9 案件详细结果")
        print("=" * 60)
        for name, r in result.items():
            status = "✅" if r is True else ("⚠️" if r is None else "❌")
            print(f"  {status} {name}: {r}")

        await browser.close()


asyncio.run(main())
