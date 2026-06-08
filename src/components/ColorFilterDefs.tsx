import React from 'react';

interface ColorFilterDefsProps {
  videoId: string;
  finalR: string;
  finalG: string;
  finalB: string;
  alpha: string;
  gamma: number;
  negative: boolean;
}

export const ColorFilterDefs: React.FC<ColorFilterDefsProps> = ({
  videoId,
  finalR,
  finalG,
  finalB,
  alpha,
  gamma,
  negative,
}) => {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
      <defs>
        <filter id={`filter-${videoId}`}>
          {/* Step 1: Color Matrix for Temperature, Tint, RGB gains, and Opacity */}
          <feColorMatrix
            type="matrix"
            values={`${finalR} 0 0 0 0\n                     0 ${finalG} 0 0 0\n                     0 0 ${finalB} 0 0\n                     0 0 0 ${alpha} 0`}
            result="matrix"
          />
          {/* Step 2: Component Transfer for Gamma */}
          <feComponentTransfer in="matrix" result="transfer">
            <feFuncR type="gamma" amplitude="1" exponent={gamma} />
            <feFuncG type="gamma" amplitude="1" exponent={gamma} />
            <feFuncB type="gamma" amplitude="1" exponent={gamma} />
          </feComponentTransfer>
          {/* Step 3: Inversion if negative is active */}
          {negative ? (
            <feComponentTransfer in="transfer">
              <feFuncR type="table" tableValues="1 0" />
              <feFuncG type="table" tableValues="1 0" />
              <feFuncB type="table" tableValues="1 0" />
            </feComponentTransfer>
          ) : null}
        </filter>
      </defs>
    </svg>
  );
};
