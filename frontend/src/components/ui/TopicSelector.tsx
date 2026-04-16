import { useQuery } from '@tanstack/react-query';
import { postsApi } from '../../services/posts';
import type { Topic } from '../../services/types';

interface TopicSelectorProps {
    selected: number[];
    onChange: (ids: number[]) => void;
}

// Chọn các chủ đề cho bài viết.
export default function TopicSelector({
    selected,
    onChange
}: TopicSelectorProps) {
    const { data: topics } = useQuery({
        queryKey: ['topics'],
        queryFn: postsApi.getTopics
    });

    // Bật hoặc tắt một chủ đề.
    const toggle = (id: number) => {
        if (selected.includes(id)) {
            onChange(selected.filter((t) => t !== id));
        } else {
            onChange([...selected, id]);
        }
    };

    return (
        <div className='flex flex-wrap gap-2'>
            {topics?.map((t: Topic) => {
                const isSelected = selected.includes(t.id);
                return (
                    <button
                        key={t.id}
                        type='button'
                        onClick={() => toggle(t.id)}
                        className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                            isSelected
                                ? 'bg-blue-500 text-white border-blue-500'
                                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                        }`}
                    >
                        #{t.name}
                    </button>
                );
            })}
        </div>
    );
}
