# Math Translation Strategy

Forward math in Graham is **not** liblouis MathML tables. The worker path is:

1. **Input:** LaTeX in `$$…$$` (display) or `\(…\)` (inline).
2. **KaTeX** renders that LaTeX to MathML (`output: 'mathml'`).
3. **Speech Rule Engine** produces Nemeth or UEB math braille (`modality: 'braille'`).
4. Nemeth output is wrapped with UEB Nemeth passage indicators for literary context.

`nemeth.ctb` (and the other liblouisutdml math tables in the registry) are **not** used for this forward path. They expect liblouisutdml semantic actions on MathML, not raw KaTeX MathML via `lou_translate`. `nemeth.ctb` **is** used to **back-translate** SRE Nemeth passages.

This is an explicit product decision: SRE is the live math engine; switching to liblouis MathML would be a correctness change, not a drop-in.

Constants and wrappers live in `client/src/utils/mathBraille.ts`. The worker comments must stay consistent with this file.
