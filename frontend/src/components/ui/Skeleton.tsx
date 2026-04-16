interface SkeletonProps {
    className?: string;
}

// Khung xương loading dùng lại.
export function Skeleton({ className = '' }: SkeletonProps) {
    return (
        <div
            className={`animate-pulse bg-gray-200 dark:bg-dark-border rounded ${className}`}
        />
    );
}

// Loading giả cho thẻ bài viết.
export function PostCardSkeleton() {
    return (
        <div className='bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-3'>
            <div className='flex items-center gap-3'>
                <Skeleton className='w-10 h-10 rounded-full' />
                <div className='flex-1 space-y-1.5'>
                    <Skeleton className='h-3.5 w-28' />
                    <Skeleton className='h-2.5 w-16' />
                </div>
            </div>
            <div className='space-y-2'>
                <Skeleton className='h-3 w-full' />
                <Skeleton className='h-3 w-5/6' />
                <Skeleton className='h-3 w-4/6' />
            </div>
            <div className='flex gap-4 pt-2 border-t border-gray-100 dark:border-dark-border'>
                <Skeleton className='h-5 w-14' />
                <Skeleton className='h-5 w-14' />
            </div>
        </div>
    );
}

// Loading giả cho trang hồ sơ.
export function ProfileSkeleton() {
    return (
        <div className='bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6'>
            <div className='flex items-center gap-4'>
                <Skeleton className='w-16 h-16 rounded-full' />
                <div className='flex-1 space-y-2'>
                    <Skeleton className='h-5 w-32' />
                    <Skeleton className='h-3 w-48' />
                </div>
            </div>
            <div className='flex gap-6 mt-4 pt-4 border-t border-gray-100 dark:border-dark-border'>
                <Skeleton className='h-8 w-16' />
                <Skeleton className='h-8 w-16' />
                <Skeleton className='h-8 w-16' />
            </div>
        </div>
    );
}

// Loading giả cho bình luận.
export function CommentSkeleton() {
    return (
        <div className='space-y-2'>
            <div className='flex items-center gap-2'>
                <Skeleton className='w-8 h-8 rounded-full' />
                <Skeleton className='h-3 w-20' />
            </div>
            <Skeleton className='h-3 w-full' />
            <Skeleton className='h-3 w-2/3' />
        </div>
    );
}

// Loading giả cho thông báo.
export function NotificationSkeleton() {
    return (
        <div className='flex items-start gap-3 p-4 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border'>
            <Skeleton className='w-10 h-10 rounded-full shrink-0' />
            <div className='flex-1 space-y-2'>
                <Skeleton className='h-3 w-3/4' />
                <Skeleton className='h-2 w-1/3' />
            </div>
        </div>
    );
}

// Loading giả cho danh sách người dùng.
export function UserListSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div className='grid grid-cols-2 gap-3'>
            {[...Array(count)].map((_, i) => (
                <div
                    key={i}
                    className='flex items-center gap-3 p-3 bg-white dark:bg-dark-card rounded-xl border border-gray-100 dark:border-dark-border'
                >
                    <Skeleton className='w-10 h-10 rounded-full' />
                    <div className='flex-1 space-y-1'>
                        <Skeleton className='h-3 w-24' />
                        <Skeleton className='h-2 w-32' />
                    </div>
                </div>
            ))}
        </div>
    );
}
