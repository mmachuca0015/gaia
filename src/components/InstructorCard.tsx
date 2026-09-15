type InstructorCardProps = {
  id: number;
  name: string;
  last_name: string;
  classes_per_week: number;
  joined: string;
  onDelete: () => void;
};

function InstructorCard({
  name,
  last_name,
  classes_per_week,
  joined,
  onDelete,
}: InstructorCardProps) {
  return (
    <div className="bg-white rounded-2xl p-6">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-20 h-20 text-2xl rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-600 font-medium flex-shrink-0">
          <span>
            {name.charAt(0)}
            {last_name.charAt(0)}
          </span>
        </div>
        <div>
          <p className="font-medium text-slate-800">
            {name} {last_name}
          </p>
          <p className="text-md text-slate-600">
            {classes_per_week} clases por semana
          </p>
          <p className="text-md text-slate-400">Se unió hace {joined}</p>
        </div>
      </div>
      <div className="flex justify-center">
        <button
          onClick={onDelete}
          className="text-md px-4 py-1.5 rounded-xl border border-red-200 text-red-400 hover:bg-red-50 transition-colors cursor-pointer"
        >
          Eliminar instructor
        </button>
      </div>
    </div>
  );
}

export default InstructorCard;
