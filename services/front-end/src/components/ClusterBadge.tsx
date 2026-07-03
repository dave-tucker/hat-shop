// ClusterBadge renders a coloured pill identifying which k8s cluster
// this front-end pod is running on. The CLUSTER_NAME env var is injected
// by the Kustomize overlay at deploy time.
//
// This is the primary visual proof that you are hitting a specific cluster,
// and that data shown (orders, cart) is consistent across clusters.

const CLUSTER_COLOURS: Record<string, string> = {
  "cluster-a": "bg-blue-100 text-blue-800 border-blue-300",
  "cluster-b": "bg-purple-100 text-purple-800 border-purple-300",
  local:       "bg-green-100 text-green-800 border-green-300",
};

export function ClusterBadge() {
  const cluster = process.env.CLUSTER_NAME ?? "local";
  const colour = CLUSTER_COLOURS[cluster] ?? "bg-gray-100 text-gray-800 border-gray-300";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${colour}`}
      title="The Kubernetes cluster serving this request"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-75" />
      {cluster}
    </span>
  );
}
