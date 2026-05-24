import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove external script tags including geojson2svg, proj4, etc.
content = re.sub(r'<script src=".*?"></script>\n?', '', content)

# Replace the main script block with a simple UI script
minimal_js = '''<script>
  // UIの動作確認用（テーマ切替、パネル開閉のみ）
  document.addEventListener('DOMContentLoaded', () => {
    const themeBtn = document.getElementById('btn-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        if (document.body.classList.contains('theme-warm')) {
          document.body.classList.remove('theme-warm');
        } else {
          document.body.classList.add('theme-warm');
        }
      });
    }

    const styleToggle = document.getElementById('style-panel-toggle');
    if (styleToggle) {
      styleToggle.addEventListener('click', () => {
        const panel = document.getElementById('style-panel');
        if (panel) {
          panel.classList.toggle('open');
          const arrow = document.getElementById('style-arrow');
          if (arrow) arrow.textContent = panel.classList.contains('open') ? '▼' : '▶';
        }
      });
    }
  });
</script>'''

# Replace anything from <script> 'use strict'; to the end of the file or closing tag with our minimal js
content = re.sub(r'<script>\s*\'use strict\';[\s\S]*?</script>', minimal_js, content)

# Write out the new design template HTML
with open('design_template.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully created design_template.html")
