import * as React from "react";

import { navigate, toHash } from "../router";

type Props = Omit<React.ComponentProps<"a">, "href"> & { href: string };

export default function Link({ href, onClick, ...rest }: Props) {
  return (
    <a
      href={"#" + toHash(href)}
      onClick={(e) => {
        onClick?.(e);
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    />
  );
}
