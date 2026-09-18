---
"menpai": patch
---

Fix compound "village + road" dictionary keys swallowing the real road. The official list carries entries like `福星里福星` ("Fuxing, Fuxing Vil."), and a greedy match on one of those consumed the village name plus a fragment, stranding the rest: `臺北市中正區福星里福星北一街1號` parsed as road `福星里福星` with `北一街1號` unparsed — losing the village, the road and the house number at once.

The village is now taken when doing so reaches a road that reads further than the compound's own tail. `七里橋` is still one road rather than `七里` + `橋`, and a compound key with nothing longer after it is still used as-is.

This was also the cause of an intermittent property-test failure that had been reading as CI noise.
