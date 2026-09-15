type ClassManagementCardProps = {
  id: number;
  name: string;
  // El COALESCE del backend se queda en null si la clase no tiene instructor
  // asignado ni nombre suelto escrito a mano.
  instructor_name: string | null;
  capacity: number;
  price: number;
  onEdit: () => void;
  onDelete: () => void;
};

function ClassManagementCard({
  name,
  instructor_name,
  capacity,
  price,
  onEdit,
  onDelete,
}: ClassManagementCardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100">
      <div className="mb-3">
        <p className="font-medium text-slate-800">{name}</p>
        <p className="text-md text-slate-600">
          {instructor_name ? `con ${instructor_name}` : "Sin instructor"}
        </p>
      </div>
      <div className="flex gap-2 mb-4">
        <span className="text-md bg-[#e8eef7] text-[#1b2c44] px-3 py-1 rounded-full">
          {capacity} lugares
        </span>
        <span className="text-md bg-slate-100 text-slate-600 px-3 py-1 rounded-full">
          ${price}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onEdit}
          className="text-md px-4 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
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
