# 将 image3.jpg 转换为 favicon.ico
$sourceImage = "d:\Trae CN\Projects\PlanMosaic\Image\image3.jpg"
$outputIcon = "d:\Trae CN\Projects\PlanMosaic\favicon.ico"

try {
    # 加载图片
    $img = [System.Drawing.Image]::FromFile($sourceImage)
    
    # 创建不同尺寸的图标
    $sizes = @(16, 32, 48, 64, 128, 256)
    $iconStreams = @()
    
    foreach ($size in $sizes) {
        $bitmap = New-Object System.Drawing.Bitmap($size, $size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($img, 0, 0, $size, $size)
        $graphics.Dispose()
        
        $stream = New-Object System.IO.MemoryStream
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $iconStreams += $stream
        $bitmap.Dispose()
    }
    
    # 创建 ICO 文件
    $fileStream = [System.IO.File]::OpenWrite($outputIcon)
    $writer = New-Object System.IO.BinaryWriter($fileStream)
    
    # ICO 文件头
    $writer.Write([short]0)  # 保留
    $writer.Write([short]1)  # 类型 (1 = ICO)
    $writer.Write([short]$sizes.Count)  # 图像数量
    
    $offset = 6 + ($sizes.Count * 16)
    $imageData = @()
    
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $size = $sizes[$i]
        $stream = $iconStreams[$i]
        $data = $stream.ToArray()
        
        # 目录条目
        $writer.Write([byte]$size)  # 宽度
        $writer.Write([byte]$size)  # 高度
        $writer.Write([byte]0)      # 颜色数
        $writer.Write([byte]0)      # 保留
        $writer.Write([short]1)     # 颜色平面
        $writer.Write([short]32)    # 位深度
        $writer.Write([int]$data.Length)  # 数据大小
        $writer.Write([int]$offset)       # 数据偏移
        
        $imageData += $data
        $offset += $data.Length
    }
    
    # 写入图像数据
    foreach ($data in $imageData) {
        $writer.Write($data)
    }
    
    $writer.Close()
    $fileStream.Close()
    
    foreach ($stream in $iconStreams) {
        $stream.Close()
    }
    
    $img.Dispose()
    
    Write-Host "favicon.ico 创建成功！" -ForegroundColor Green
    Write-Host "位置: $outputIcon" -ForegroundColor Cyan
}
catch {
    Write-Host "创建 favicon.ico 时出错: $_" -ForegroundColor Red
}
