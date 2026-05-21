#!/usr/bin/env python3
"""
批量修复Kotlin文件中的缺失导入
"""

import os

# 需要添加的导入映射
IMPORT_FIXES = {
    # Profile components
    "LoginSection.kt": [
        "import androidx.compose.foundation.background",
        "import androidx.compose.runtime.saveable.rememberSaveable",
        "import androidx.compose.ui.text.font.FontWeight",
    ],
    "SubAppsSection.kt": [
        "import kotlinx.serialization.json.jsonPrimitive",
        "import androidx.lifecycle.compose.collectAsStateWithLifecycle",
        "import androidx.compose.foundation.clickable",
        "import androidx.compose.foundation.background",
    ],
    "UserProfileHeader.kt": [
        "import androidx.compose.foundation.background",
        "import androidx.compose.ui.text.font.FontWeight",
    ],
    "ApiSettingsSection.kt": [
        "import androidx.compose.foundation.background",
        "import androidx.compose.foundation.shape.CircleShape",
        "import androidx.compose.ui.text.font.FontWeight",
        "import androidx.compose.foundation.clickable",
        "import androidx.compose.ui.semantics.Role",
    ],
    # Profile common
    "DarkModeSettingRow.kt": [
        "import androidx.compose.foundation.background",
        "import androidx.compose.ui.text.font.FontWeight",
        "import androidx.compose.foundation.clickable",
    ],
    "SettingRow.kt": [
        "import androidx.compose.foundation.background",
        "import androidx.compose.ui.text.font.FontWeight",
        "import androidx.compose.foundation.clickable",
    ],
    # Profile screen
    "ProfileScreen.kt": [
        "import androidx.compose.foundation.background",
        "import androidx.compose.ui.text.font.FontWeight",
    ],
    # Main
    "MainActivity.kt": [
        "import androidx.compose.foundation.background",
    ],
    # Mosa
    "MosaScreen.kt": [
        "import androidx.compose.foundation.background",
        "import androidx.compose.ui.text.font.FontWeight",
    ],
    # Vocab
    "VocabAIView.kt": [
        "import androidx.compose.foundation.background",
        "import androidx.compose.ui.text.font.FontWeight",
        "import androidx.compose.foundation.clickable",
    ],
    "VocabStatsView.kt": [
        "import androidx.compose.foundation.background",
        "import androidx.compose.ui.text.font.FontWeight",
    ],
    "VocabMistakesView.kt": [
        "import androidx.compose.foundation.background",
        "import androidx.compose.ui.text.font.FontWeight",
    ],
    "VocabScreen.kt": [
        "import androidx.compose.foundation.background",
        "import androidx.compose.ui.text.font.FontWeight",
        "import androidx.compose.foundation.clickable",
    ],
    # Schedule
    "ScheduleScreen.kt": [
        "import androidx.compose.foundation.background",
        "import androidx.compose.ui.text.font.FontWeight",
    ],
    # Components
    "BottomNavBar.kt": [
        "import androidx.compose.foundation.background",
    ],
    "CustomCheckbox.kt": [
        "import androidx.compose.foundation.background",
    ],
    # Theme
    "Theme.kt": [
        "import androidx.compose.foundation.background",
    ],
    "Color.kt": [
        "import androidx.compose.foundation.background",
    ],
    "Type.kt": [
        "import androidx.compose.ui.text.font.FontWeight",
    ],
}

def fix_file_imports(file_path, imports_to_add):
    """修复单个文件的导入"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 检查每个导入是否已存在
    imports_needed = []
    for imp in imports_to_add:
        if imp not in content:
            imports_needed.append(imp)
    
    if not imports_needed:
        return 0
    
    # 找到package行后的位置插入导入
    lines = content.split('\n')
    import_idx = 0
    for i, line in enumerate(lines):
        if line.startswith('package '):
            import_idx = i + 1
            break
    
    # 跳过空行，找到第一个import或类定义的位置
    while import_idx < len(lines) and lines[import_idx].strip() == '':
        import_idx += 1
    
    # 插入新导入
    new_lines = lines[:import_idx] + [''] + imports_needed + lines[import_idx:]
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_lines))
    
    return len(imports_needed)

def main():
    base_path = r"d:\Trae CN\Projects\PlanMosaic\PlanMosaic AndroidStudio\app\src\main\java\com\example\planmosaic_android"
    
    total_fixed = 0
    for filename, imports in IMPORT_FIXES.items():
        # 递归查找文件
        for root, dirs, files in os.walk(base_path):
            if filename in files:
                file_path = os.path.join(root, filename)
                fixed = fix_file_imports(file_path, imports)
                if fixed > 0:
                    print(f"✓ {filename} - 已添加 {fixed} 个导入")
                    total_fixed += fixed
                break
    
    print(f"\n完成！共修复 {total_fixed} 个导入")

if __name__ == "__main__":
    main()
