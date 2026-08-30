export type SubmissionLinks = Readonly<{
  repository: string;
  issueForm: string;
  pullRequest: string;
  example: string;
}>;

export function createSubmissionLinks(repositoryUrl: string | undefined): SubmissionLinks | null {
  if (!repositoryUrl) return null;
  return Object.freeze({
    repository: repositoryUrl,
    issueForm: `${repositoryUrl}/issues/new?template=resource-submission.yml`,
    pullRequest: `${repositoryUrl}/compare`,
    example: `${repositoryUrl}/blob/HEAD/examples/resource-submission/resource.json`,
  });
}
