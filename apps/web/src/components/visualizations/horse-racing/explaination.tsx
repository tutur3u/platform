import { Card, CardContent } from '@tuturuuu/ui/card';
import { ChevronDown, ChevronUp, Trophy, Zap } from '@tuturuuu/ui/icons';

export default function Explanation() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="prose dark:prose-invert max-w-none">
          <h3 className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            The Problem
          </h3>
          <p>
            We have N horses and want to find their ranking from fastest to
            slowest. However, we can only race M horses at a time to determine
            their relative speeds. The goal is to find the complete ranking
            using the minimum number of races.
          </p>

          <div className="my-4 rounded-md bg-muted p-3">
            <p className="text-sm italic">
              <strong>Example:</strong> With 25 horses where we can race 5 at a
              time, a naive approach would require many races. Our algorithm
              reduces this significantly by using clever grouping and
              elimination strategies.
            </p>
          </div>

          <h3 className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Algorithm Approach
          </h3>
          <p>
            Our algorithm uses several key strategies to efficiently determine
            the ranking:
          </p>

          <ol>
            <li>
              <strong>Initial Grouping:</strong> Divide the N horses into
              ceiling(N/M) groups and race each group separately to get
              preliminary rankings.
              <div className="ml-6 text-muted-foreground text-sm">
                Example: With 25 horses racing 5 at a time, we form 5 groups of
                5 horses each.
              </div>
            </li>
            <li>
              <strong>Tournament of Champions:</strong> Race the winners from
              each group to determine the overall fastest horse.
              <div className="ml-6 text-muted-foreground text-sm">
                This immediately identifies the #1 position in our final
                ranking.
              </div>
            </li>
            <li>
              <strong>Candidate Set Maintenance:</strong> For each position,
              maintain a set of candidates who could potentially be next in the
              ranking.
              <div className="ml-6 text-muted-foreground text-sm">
                For the #2 position, we only need to consider the runner-up from
                the #1's group and the winners from other groups.
              </div>
            </li>
            <li>
              <strong>Progressive Elimination:</strong> Through strategic races,
              progressively determine the complete ranking by efficiently
              eliminating horses that cannot be faster than the current
              candidates.
            </li>
          </ol>

          <h3 className="flex items-center gap-2">
            <ChevronUp className="h-4 w-4 text-green-500" />
            Key Insights
          </h3>
          <p>
            The algorithm leverages the <strong>transitive property</strong> of
            race outcomes: if horse A is faster than horse B, and horse B is
            faster than horse C, then horse A is faster than horse C without
            needing to race them directly.
          </p>

          <p>
            For any position in the final ranking, we only need to consider a
            small subset of horses as candidates, not the entire remaining pool.
            This significantly reduces the number of races needed.
          </p>

          <div className="my-4 rounded-md bg-muted p-3">
            <p className="text-sm">
              <strong>Real-World Applications:</strong> This algorithm
              demonstrates principles used in tournament design, searching in
              partially ordered sets, and efficient sorting with limited
              comparisons—concepts that appear in database query optimization,
              network routing, and other computational problems.
            </p>
          </div>

          <h3 className="flex items-center gap-2">
            <ChevronDown className="h-4 w-4 text-blue-500" />
            Theoretical Analysis
          </h3>
          <p>
            The algorithm requires approximately O(N log N / log M) races in the
            optimal case, which is close to the theoretical lower bound for this
            problem. This is a significant improvement over the naive O(N²/M)
            approach.
          </p>

          <h3>Race Types in the Visualization</h3>
          <ul className="space-y-2">
            <li className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-blue-500"></div>
              <span>
                <strong>Preliminary Races:</strong> Initial races to determine
                rankings within small groups
              </span>
            </li>
            <li className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-purple-500"></div>
              <span>
                <strong>Championship Race:</strong> Race between the winners of
                preliminary groups to find the overall fastest horse
              </span>
            </li>
            <li className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
              <span>
                <strong>Candidate Races:</strong> Races to determine the next
                position in the final ranking
              </span>
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
