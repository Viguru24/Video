import sys

def check_balance(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    div_open = content.count('<div')
    div_close = content.count('</div')
    
    print(f"<div>: {div_open}")
    print(f"</div>: {div_close}")
    
    # Check for other common tags
    header_open = content.count('<header')
    header_close = content.count('</header')
    print(f"<header>: {header_open}")
    print(f"</header>: {header_close}")

if __name__ == "__main__":
    check_balance(sys.argv[1])
