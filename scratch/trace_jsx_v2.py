import sys
import re

content = open('src/components/ControlBar.tsx', encoding='utf-8').read()
start_pos = content.find('return (')
sub = content[start_pos:]

# Find all div tags with their positions
matches = re.finditer(r'<(div|/div)', sub)
stack = []
for m in matches:
    tag = m.group(1)
    pos = start_pos + m.start()
    line = content[:pos].count('\n') + 1
    
    if tag == 'div':
        stack.append((line, tag))
    else:
        if not stack:
            print(f"Extra closing div at line {line}")
        else:
            stack.pop()

for line, tag in stack:
    print(f"Unclosed {tag} at line {line}")
