import { Calendar, Clock } from "lucide-react";

type BookingsCardProps = {
  studio_name: string;
  instructor: string;
  day: string;
  time: string;
  isPast?: boolean;
};

function BookingsCard({
  studio_name,
  instructor,
  day,
  time,
  isPast = false,
}: BookingsCardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <p className="font-semibold text-stone-800 text-lg">{studio_name}</p>
        <button className="text-sm text-stone-400 underline hover:text-stone-600 transition-colors cursor-pointer">
          {isPast ? "Ver más" : "Cancelar"}
        </button>
      </div>

      <p className="text-sm italic text-stone-600 mb-4">con {instructor}</p>

      <div className="flex items-center gap-4 text-sm text-stone-500">
        <div className="flex items-center gap-1.5">
          <Calendar size={14} />
          <span>{day}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={14} />
          <span>{time.slice(0, 5)}</span>
        </div>
      </div>
    </div>
  );
}

export default BookingsCard;
