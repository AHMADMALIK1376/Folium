# Folium — logo brief

## The idea

"Folium" is Latin for **leaf**. In publishing, a **folio** is a *leaf of a book* — a page.
The name already carries the double meaning the product needs:

> a leaf that is also a page

The mark should express that in one shape, readable in under a second.

## Type of mark

**Pictorial mark** (a simplified real object), not an abstract shape.

Nike's swoosh works because "Nike" means nothing visual, so the shape had to invent meaning.
"Folium" already means leaf — a recognisable leaf reinforces the name for free, and an abstract
shape would discard that. Simplify the leaf until it is nearly geometric, but keep it a leaf.

## Colours

Only two. No gradients, no third colour.

| Token | Hex |
|---|---|
| Carmine | `#D41F26` |
| White | `#FFFFFF` |

## Prompt A — leaf whose veins are lines of text (recommended)

```
A minimalist flat vector logo of a single leaf, viewed straight on, rendered in solid
carmine red #D41F26 on a pure white background.

The leaf is a simple pointed oval — geometric and clean, not botanical or detailed.
Inside the leaf, instead of natural veins, there are four horizontal straight lines of
varying length, evenly spaced, suggesting lines of written text on a page. The lines are
cut out of the leaf in white, so the leaf reads as both a leaf and a written page.

Style: flat 2D vector, single solid colour, no gradient, no shadow, no outline, no 3D,
no texture, no highlights. Crisp geometric edges. Perfectly symmetrical vertically.
Centred on a square canvas with generous empty margin around the mark.
Simple enough to stay legible at 32x32 pixels.
Modern, calm, professional. No text, no letters, no words anywhere in the image.
```

## Prompt B — page corner curling into a leaf

```
A minimalist flat vector logo showing a sheet of paper whose top-right corner curls over
and becomes the tip of a leaf. Solid carmine red #D41F26 on a pure white background.

The paper is a plain rectangle with slightly rounded corners. The curled corner tapers to
a soft point like a leaf tip, with one clean curved line where the leaf's central vein
would be. The transition from page to leaf should be a single continuous shape.

Style: flat 2D vector, one solid colour, no gradient, no shadow, no 3D, no texture.
Clean geometric construction. Centred on a square canvas with generous empty margin.
Legible at 32x32 pixels. No text, no letters, no words in the image.
```

## Prompt C — leaf built from two overlapping shapes

```
A minimalist abstract logo mark of a leaf formed by two overlapping curved shapes that
meet at a point at the top and bottom, like a pointed oval (vesica) tilted slightly to
the right. Solid carmine red #D41F26 on a pure white background.

One half is solid carmine; the other half is white with a thin carmine outline, so the
leaf reads as two pages meeting — suggesting two people sharing one document.

Style: flat 2D vector, geometric, no gradient, no shadow, no 3D. Sharp clean edges.
Centred on a square canvas with generous margin. Legible at 32x32 pixels.
No text, no letters, no words in the image.
```

Prompt C carries a second meaning — two halves meeting — which suits a *collaborative* editor.
Try A first; it is the clearest.

## Output specs

Generate square (1:1). Then save into this folder:

| File | Purpose | Size |
|---|---|---|
| `weblogo.png` | Main logo used in the app header | 512x512, transparent background |
| `weblogo-mark.png` | Symbol only, no padding | 512x512, transparent background |
| `favicon.png` | Browser tab icon | 32x32, transparent background |

If the generator only produces a white background, remove it afterwards (remove.bg, Photopea,
or Paint.NET) so the mark sits correctly on any surface.

## How to judge the result

1. Shrink it to 32x32. If it turns to mush, it is too detailed — go simpler.
2. Print it in black and white. If it stops working without colour, the shape is too weak.
3. Show it to someone for one second. If they cannot say "leaf", it is too abstract.

## Avoid

- Gradients, glows, drop shadows, bevels, 3D
- More than two colours
- Fine detail such as serrated leaf edges or many small veins
- Any text or lettering inside the mark — the wordmark is set separately in the app
- Photorealism or hand-drawn illustration
