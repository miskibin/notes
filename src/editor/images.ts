import { $remark } from "@milkdown/kit/utils";

type ImageNode = { type: string; title?: string | null; alt?: string | null; children?: ImageNode[] };

// CommonMark omits an optional title as null; Milkdown's image schemas require strings.
export const imageDefaults = $remark("imageDefaults", () => () => (tree: ImageNode) => {
  const visit = (node: ImageNode) => {
    if (node.type === "image" || node.type === "image-block") {
      node.title ??= node.alt && !Number.isFinite(Number(node.alt)) ? node.alt : "";
      node.alt ??= "";
    }
    node.children?.forEach(visit);
  };
  visit(tree);
});
