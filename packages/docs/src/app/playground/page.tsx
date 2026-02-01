import type { Metadata } from "next";
import { FullPlayground } from "@/components/Playground/FullPlayground";

export const metadata: Metadata = {
  title: "Playground",
  description: "Interactive vcad playground - design 3D models in your browser",
};

export default function PlaygroundPage() {
  return <FullPlayground />;
}
