"""
Batch replace emerald green color values with chocolate brown palette
across all mobile JS files AND teacher portal JSX files.

Old → New mapping:
  #0B6E4F  →  #7B4F2E   (primary emerald → dark chocolate)
  #064E3B  →  #5C3820   (dark emerald → deep chocolate)
  #D1FAE5  →  #F5E6D8   (light emerald → soft beige)
  #F8FAF8  →  #FFFDF0   (old off-white bg → warm cream)
  #FEFCE8  →  #FFFDF0   (old yellow bg → warm cream)
  #F8F5F0  →  #FFFDF0   (variant bg → warm cream)
  #FFF9E6  →  #FFF9E6   (soft cream — keep)
  #FFFDF0  →  #FFFDF0   (warm cream — keep)

  Also update gradients and rgba versions:
  rgba(11, 110, 79, ...)  →  rgba(123, 79, 46, ...)
  rgba(6, 78, 59, ...)    →  rgba(92, 56, 32, ...)

Background: all screens should use #FFFDF0 as their base background.
"""
import glob, os, re

MOBILE_SCREENS = glob.glob('e:/TasmiqAI/tasmiq-mobile/src/**/*.js', recursive=True)
PORTAL_SCREENS = glob.glob('e:/TasmiqAI/tasmiq-teacher-portal/src/**/*.jsx', recursive=True) + \
                 glob.glob('e:/TasmiqAI/tasmiq-teacher-portal/src/**/*.js', recursive=True)

ALL_FILES = MOBILE_SCREENS + PORTAL_SCREENS

# Exact hex replacements (case-insensitive)
HEX_MAP = [
    # Emerald greens → chocolate browns
    ('#0B6E4F', '#7B4F2E'),
    ('#0b6e4f', '#7B4F2E'),
    ('#064E3B', '#5C3820'),
    ('#064e3b', '#5C3820'),
    # Light emerald → soft beige
    ('#D1FAE5', '#F5E6D8'),
    ('#d1fae5', '#F5E6D8'),
    ('#A7F3D0', '#EDD5BF'),  # lighter emerald variants
    ('#a7f3d0', '#EDD5BF'),
    # Status greens (keep these as actual greens for PASS indicators)
    # '#065F46' → keep (this is used for PASS text color)
    # '#047857' → keep (enrolled badge)
    # Old background yellows → warm cream
    ('#FEFCE8', '#FFFDF0'),
    ('#fefce8', '#FFFDF0'),
    ('#F8FAF8', '#FFFDF0'),
    ('#f8faf8', '#FFFDF0'),
    ('#F8F5F0', '#FFFDF0'),
    # E8F5EC (light green tint) → light beige
    ('#E8F5EC', '#F5E6D8'),
    ('#e8f5ec', '#F5E6D8'),
    ('#E8F0EA', '#EDE0D4'),
    ('#e8f0ea', '#EDE0D4'),
    # E0F2FE (teal bg) stays as is (used for secondary icons)
]

# rgba replacements
RGBA_MAP = [
    (r'rgba\(11,\s*110,\s*79,', 'rgba(123, 79, 46,'),
    (r'rgba\(6,\s*78,\s*59,',   'rgba(92, 56, 32,'),
    (r'rgba\(11,\s*110,\s*79\b', 'rgba(123, 79, 46'),
]

# String replacements for template literal patterns like `${PRIMARY}` constants
CONST_MAP = [
    # These appear in files that define their own constants
    ("const P   = '#0B6E4F'",   "const P   = '#7B4F2E'"),
    ("const P  = '#0B6E4F'",    "const P  = '#7B4F2E'"),
    ("const PD  = '#064E3B'",   "const PD  = '#5C3820'"),
    ("const PD = '#064E3B'",    "const PD = '#5C3820'"),
    ("const PL  = '#D1FAE5'",   "const PL  = '#F5E6D8'"),
    ("const PL = '#D1FAE5'",    "const PL = '#F5E6D8'"),
    ("const PRIMARY   = '#0B6E4F'", "const PRIMARY   = '#7B4F2E'"),
    ("const PRIMARY  = '#0B6E4F'",  "const PRIMARY  = '#7B4F2E'"),
    ("const PRIMARY = '#0B6E4F'",   "const PRIMARY = '#7B4F2E'"),
    ("const DARK_EM   = '#064E3B'", "const DARK_EM   = '#5C3820'"),
    ("const DARK_EM  = '#064E3B'",  "const DARK_EM  = '#5C3820'"),
    ("const DARK_EM = '#064E3B'",   "const DARK_EM = '#5C3820'"),
    ("const E  = '#0B6E4F'",    "const E  = '#7B4F2E'"),
    ("const ED = '#064E3B'",    "const ED = '#5C3820'"),
    ("const EL = '#D1FAE5'",    "const EL = '#F5E6D8'"),
    ("const BG = '#FEFCE8'",    "const BG = '#FFFDF0'"),
    ("const BG = \"#FEFCE8\"",  "const BG = '#FFFDF0'"),
    # Teacher portal D object
    ("emerald:      '#0B6E4F'", "emerald:      '#7B4F2E'"),
    ("emeraldDark:  '#064E3B'", "emeraldDark:  '#5C3820'"),
    ("emeraldLight: '#D1FAE5'", "emeraldLight: '#F5E6D8'"),
    ("emerald:  '#0B6E4F'",     "emerald:  '#7B4F2E'"),
    ("emeraldDark:  '#064E3B'", "emeraldDark:  '#5C3820'"),
    ("bg:           '#FEFCE8'", "bg:           '#FFFDF0'"),
]

changed = []

for path in ALL_FILES:
    if 'node_modules' in path or 'dist-check' in path or '.conda' in path:
        continue
    if 'colors.js' in path:
        continue  # already updated

    try:
        src = open(path, encoding='utf-8').read()
        orig = src

        # Apply constant replacements first (most specific)
        for old, new in CONST_MAP:
            src = src.replace(old, new)

        # Apply hex replacements
        for old, new in HEX_MAP:
            src = src.replace(old, new)

        # Apply rgba replacements
        for pattern, replacement in RGBA_MAP:
            src = re.sub(pattern, replacement, src)

        if src != orig:
            open(path, 'w', encoding='utf-8').write(src)
            changed.append(os.path.basename(path))

    except Exception as e:
        print(f'ERROR {os.path.basename(path)}: {e}')

print(f'Updated {len(changed)} files:')
for f in sorted(set(changed)):
    print(f'  {f}')
