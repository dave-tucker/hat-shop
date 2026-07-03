"use client";

import { useState } from "react";
import { HatLogo } from "./HatLogo";

export function HatImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const imgClass = className ?? "w-full h-40 object-cover rounded-lg";

  if (failed || !src) {
    return (
      <div className={`flex justify-center items-center text-gray-200 bg-gray-50 rounded-lg ${className?.includes('h-') ? className.replace(/object-\S+/, '') : 'h-40'}`}>
        <HatLogo className="w-24 h-16" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={imgClass}
      onError={() => setFailed(true)}
    />
  );
}
