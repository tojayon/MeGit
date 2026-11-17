import { useId } from 'react';
import { useTranslation } from 'react-i18next';

export function BrandLogo({
  variant = 'icon',
  className = '',
  decorative = false,
}: {
  variant?: 'icon' | 'full';
  className?: string;
  decorative?: boolean;
}) {
  const { t } = useTranslation();
  const outlineId = useId();
  const full = variant === 'full';
  return (
    <svg
      className={`brand-logo ${className}`}
      viewBox={full ? '0 0 960 280' : '0 0 512 512'}
      width={full ? 960 : 512}
      height={full ? 280 : 512}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : t('brand.name')}
      aria-hidden={decorative || undefined}
      focusable="false"
    >
      <defs>
        <filter
          id={outlineId}
          x="-15%"
          y="-15%"
          width="130%"
          height="130%"
          colorInterpolationFilters="sRGB"
        >
          <feMorphology
            in="SourceAlpha"
            operator="dilate"
            radius={full ? 6 : 8}
            result="expanded"
          />
          <feComposite in="expanded" in2="SourceAlpha" operator="out" result="outline" />
          <feFlood className="brand-symbol-outline" result="outline-color" />
          <feComposite in="outline-color" in2="outline" operator="in" result="colored-outline" />
          <feMerge>
            <feMergeNode in="colored-outline" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {full ? (
        <g transform="translate(28 28)">
          <g filter={`url(#${outlineId})`}>
            <image
              href="/brand/megit-icon.svg"
              x="-59"
              y="-16"
              width="512"
              height="512"
              transform="scale(0.464)"
            />
          </g>
          <use href="/brand/megit-logo.svg#megit-logo-wordmark" />
        </g>
      ) : (
        <image
          href="/brand/megit-icon.svg"
          width="512"
          height="512"
          filter={`url(#${outlineId})`}
        />
      )}
    </svg>
  );
}
