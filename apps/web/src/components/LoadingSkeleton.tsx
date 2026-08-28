interface LoadingSkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

export default function LoadingSkeleton({ width = '100%', height = 20, borderRadius = 4, style }: LoadingSkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-loading 1.5s infinite',
        ...style
      }}
    />
  );
}
