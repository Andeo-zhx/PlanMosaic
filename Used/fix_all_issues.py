#!/usr/bin/env python3
"""
全面修复Kotlin编译错误
"""

import os
import re

base_path = r"d:\Trae CN\Projects\PlanMosaic\PlanMosaic AndroidStudio\app\src\main\java\com\example\planmosaic_android"

def fix_file(file_path, fixes):
    """应用修复到文件"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    for old, new in fixes:
        content = content.replace(old, new)
    
    if content != original:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def add_imports(file_path, imports):
    """添加导入语句"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    import_idx = 0
    for i, line in enumerate(lines):
        if line.startswith('package '):
            import_idx = i + 1
            break
    
    while import_idx < len(lines) and lines[import_idx].strip() == '':
        import_idx += 1
    
    imports_to_add = [imp for imp in imports if imp not in content]
    if imports_to_add:
        new_lines = lines[:import_idx] + [''] + imports_to_add + lines[import_idx:]
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_lines))
        return len(imports_to_add)
    return 0

# 定义所有修复
all_fixes = []

# 遍历所有kt文件
for root, dirs, files in os.walk(base_path):
    for file in files:
        if file.endswith('.kt'):
            file_path = os.path.join(root, file)
            
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            fixes_applied = 0
            
            # 修复1: jsonPrimitive.boolean -> booleanOrNull
            if 'jsonPrimitive?.boolean' in content and 'booleanOrNull' not in content:
                content = content.replace('jsonPrimitive?.boolean', 'jsonPrimitive?.booleanOrNull')
                fixes_applied += 1
            
            # 修复2: 添加常见缺失导入
            common_imports = []
            if 'rememberSaveable' in content and 'import androidx.compose.runtime.saveable.rememberSaveable' not in content:
                common_imports.append('import androidx.compose.runtime.saveable.rememberSaveable')
            if 'FontWeight' in content and 'import androidx.compose.ui.text.font.FontWeight' not in content:
                common_imports.append('import androidx.compose.ui.text.font.FontWeight')
            if '.background(' in content and 'import androidx.compose.foundation.background' not in content:
                common_imports.append('import androidx.compose.foundation.background')
            if '.clickable(' in content and 'import androidx.compose.foundation.clickable' not in content:
                common_imports.append('import androidx.compose.foundation.clickable')
            if 'RoundedCornerShape' in content and 'import androidx.compose.foundation.shape.RoundedCornerShape' not in content:
                common_imports.append('import androidx.compose.foundation.shape.RoundedCornerShape')
            if 'CircleShape' in content and 'import androidx.compose.foundation.shape.CircleShape' not in content:
                common_imports.append('import androidx.compose.foundation.shape.CircleShape')
            if 'KeyboardArrowRight' in content:
                if 'import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight' not in content:
                    common_imports.append('import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight')
            if '.clip(' in content and 'import androidx.compose.ui.draw.clip' not in content:
                common_imports.append('import androidx.compose.ui.draw.clip')
            if 'Role' in content and 'import androidx.compose.ui.semantics.Role' not in content:
                common_imports.append('import androidx.compose.ui.semantics.Role')
            
            if common_imports:
                lines = content.split('\n')
                import_idx = 0
                for i, line in enumerate(lines):
                    if line.startswith('package '):
                        import_idx = i + 1
                        break
                while import_idx < len(lines) and lines[import_idx].strip() == '':
                    import_idx += 1
                
                imports_to_add = [imp for imp in common_imports if imp not in content]
                if imports_to_add:
                    new_lines = lines[:import_idx] + [''] + imports_to_add + lines[import_idx:]
                    content = '\n'.join(new_lines)
                    fixes_applied += len(imports_to_add)
            
            if fixes_applied > 0:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"✓ {os.path.basename(file_path)} - 修复 {fixes_applied} 处")

print("\n第一阶段修复完成！")
