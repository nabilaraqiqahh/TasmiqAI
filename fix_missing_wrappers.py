"""
Fix all screens where IslamicBackground removal left return() with no root JSX wrapper.
Pattern:  return (\n    \n        <StatusBar  or  return (\n    \n        <View  etc.
"""
import glob, os, re

SCREENS = [f for f in glob.glob('e:/TasmiqAI/tasmiq-mobile/src/**/*.js', recursive=True)
           if 'dist-check' not in f and 'node_modules' not in f]

# Pattern: return ( followed by blank line then non-<SafeAreaView JSX
PATTERN = re.compile(
    r'(  return \(\n)(    \n)(        )(<(?!SafeAreaView|NudgeErrorBoundary))',
    re.MULTILINE
)

fixed = []

for path in SCREENS:
    src = open(path, encoding='utf-8').read()
    original = src

    # Check if this pattern exists
    if PATTERN.search(src):
        # Replace with proper SafeAreaView wrapper
        new_src = PATTERN.sub(
            r'\1    <SafeAreaView style={{ flex: 1, backgroundColor: \'#FFFDF0\' }}>\n      \4',
            src
        )
        # Only write if changed and the SafeAreaView count now needs balancing
        if new_src != src:
            open(path, 'w', encoding='utf-8').write(new_src)
            fixed.append(os.path.basename(path))

if fixed:
    print('Fixed missing wrappers in:')
    for f in fixed: print(' ', f)
else:
    print('No missing wrapper patterns found')
