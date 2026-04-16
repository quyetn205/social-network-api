import type { Topic } from '../../services/types';

interface TopicBadgeProps {
    topic: Topic;
    onRemove?: () => void;
    size?: 'sm' | 'md';
}

// Hiển thị nhãn chủ đề.
export default function TopicBadge({
    topic,
    onRemove,
    size = 'sm'
}: TopicBadgeProps) {
    const sizeClass =
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

    return (
        <span
            className={`inline-flex items-center gap-1 bg-blue-100 text-blue-700 rounded-full font-medium ${sizeClass}`}
        >
            #{topic.name}
            {onRemove && (
                <button onClick={onRemove} className='hover:text-blue-900 ml-1'>
                    &times;
                </button>
            )}
        </span>
    );
}
