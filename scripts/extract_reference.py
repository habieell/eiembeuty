"""Extract all Word text, tables, media, and exact supplied app assets.
Usage: python scripts/extract_reference.py 'C:/path/Soal Coding Test.docx'
Only Python's standard library is required.
"""
import argparse
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('docx', type=Path)
args = parser.parse_args()
project = Path(__file__).resolve().parents[1]
reference = project / 'docs/reference'
assets = project / 'frontend/public/assets'
reference.mkdir(parents=True, exist_ok=True)
assets.mkdir(parents=True, exist_ok=True)
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with ZipFile(args.docx) as doc:
    sections = []
    for name in doc.namelist():
        if name.startswith('word/') and name.endswith('.xml') and '/_' not in name:
            root = ET.fromstring(doc.read(name))
            lines = []
            for node in root.iter():
                if node.tag == '{%s}p' % ns['w']:
                    text = ''.join(node.itertext()) if not node.findall('.//w:t', ns) else ''.join(t.text or '' for t in node.findall('.//w:t', ns))
                    if text.strip():
                        lines.append(text)
            sections.append('PART ' + name + '\n' + '\n'.join(lines))
    (reference / 'all-text.txt').write_text('\n\n'.join(sections), encoding='utf-8')
    mapping = {'image12.png':'logo.png','image13.png':'acne-serum.png','image14.png':'hydration-serum.png','image15.png':'brightening-serum.png'}
    media = []
    for name in doc.namelist():
        if name.startswith('word/media/') and not name.endswith('/'):
            filename = Path(name).name
            content = doc.read(name)
            (reference / filename).write_bytes(content)
            if filename in mapping:
                (assets / mapping[filename]).write_bytes(content)
            media.append(filename)
    print(f'Extracted {len(media)} embedded media files and all XML text to {reference}')
