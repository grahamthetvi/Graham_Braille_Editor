# Math Translation Strategy

## Problem
LibLouis requires MathML to translate math into Nemeth Code. Our user inputs LaTeX.

## Solution
We will use `mathjax-full` (specifically `input-tex` and `output-mathml`).

## Implementation Details
1. **Input:** `x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`
2. **MathJax Config:**
   ```javascript
   const mathDocument = MathJax.mathjax.document('', {
     InputJax: new TeX({ packages: AllPackages }),
     OutputJax: new MathML({ compileError: (doc, math, err) => doc.compileError(math, err) })
   });
