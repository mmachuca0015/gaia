type ClassManagementCardProps = {
  id: number;
  name: string;
  instructor_name: string;
  capacity: number;
  price: number;
  onEdit: () => void;
  onDelete: () => void;
};

function ClassManagementCard({
  id,
  name,
  instructor_name,
  capacity,
  price,
  onEdit,
  onDelete,
}: ClassManagementCardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-stone-100">
      <div className="mb-3">
        <p className="font-medium text-stone-800">{name}</p>
        <p className="text-md text-stone-600">con {instructor_name}</p>
      </div>
      <div className="flex gap-2 mb-4">
        <span className="text-md bg-[#e8f0e8] text-[#3a5a3a] px-3 py-1 rounded-full">
          {capacity} lugares
        </span>
        <span className="text-md bg-stone-100 text-stone-600 px-3 py-1 rounded-full">
          ${price}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onEdit}
          className="text-md px-4 py-1.5 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors cursor-pointer"
        >
          Editar
        </button>
        <button
          onClick={onDelete}
          className="text-md px-4 py-1.5 rounded-xl border border-red-200 text-red-400 hover:bg-red-50 transition-colors cursor-pointer"
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}

export default ClassManagementCard;
