"use client";

import { useState } from "react";
import { HatLogo } from "./HatLogo";

export function HatImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className="flex justify-center items-center py-4 text-gray-200 bg-gray-50 rounded-lg h-40">
        <HatLogo className="w-24 h-16" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="w-full h-40 object-cover rounded-lg"
      onError={() => setFailed(true)}
    />
  );
}
