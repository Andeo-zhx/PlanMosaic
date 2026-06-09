import pyautogui
import os
from datetime import datetime

screenshot = pyautogui.screenshot()
path = os.path.join(os.environ['TEMP'], 'screenshot_' + datetime.now().strftime('%Y%m%d_%H%M%S') + '.png')
screenshot.save(path)
print('Screenshot saved to: ' + path)