import sys
content = open('src/components/ControlBar.tsx', encoding='utf-8').read()
start = content.find('return (')
sub = content[start:]
print(f"Open: {sub.count('<div')}")
print(f"Close: {sub.count('</div')}")

# Try to find where it breaks
stack = []
import re
tags = re.findall(r'<(div|/div)', sub)
for i, tag in enumerate(tags):
    if tag == 'div':
        stack.append(i)
    else:
        if not stack:
            print(f"Extra closing div at index {i}")
        else:
            stack.pop()

if stack:
    print(f"Unclosed divs at indices: {stack}")
